package com.bdcraft.shop;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;

/**
 * Thin JDBC wrapper around the shared Neon Postgres database.
 * The webshop inserts order_items against 'paid' orders; this class hands
 * the plugin the rows that still need delivering.
 */
public final class Database {

    /** A row from order_items that still needs delivering. */
    public record OrderItem(
        long id,
        String username,
        String type,       // "money" | "item"
        double amount,     // in-game coins (already qty-scaled) for money products
        String material,   // Bukkit Material for item products
        int itemAmount,    // items per unit (worker multiplies by qty)
        int qty,
        String command     // console command template, may be null
    ) {}

    private final String url;
    private final String user;
    private final String password;
    private Connection connection;

    public Database(String url, String user, String password) throws SQLException {
        this.url = url;
        this.user = user;
        this.password = password;
        DriverManager.getConnection(url, user, password).close(); // fail fast on bad config
    }

    private synchronized Connection connection() throws SQLException {
        if (connection == null || connection.isClosed()) {
            connection = DriverManager.getConnection(url, user, password);
        }
        return connection;
    }

    public synchronized void close() throws SQLException {
        if (connection != null && !connection.isClosed()) connection.close();
        connection = null;
    }

    private static final String SELECT_COLUMNS =
        "SELECT oi.id, o.mc_username, oi.delivery_type, COALESCE(oi.amount,0), " +
        "oi.item_material, COALESCE(oi.item_amount,1), oi.qty, oi.command_template " +
        "FROM order_items oi JOIN orders o ON o.id = oi.order_id ";

    public List<OrderItem> fetchUndelivered() throws SQLException {
        return query(SELECT_COLUMNS +
            "WHERE o.status = 'paid' AND oi.delivered = FALSE " +
            "ORDER BY oi.id LIMIT 100", null);
    }

    public List<OrderItem> fetchUndeliveredFor(String username) throws SQLException {
        return query(SELECT_COLUMNS +
            "WHERE o.status = 'paid' AND oi.delivered = FALSE AND lower(o.mc_username) = lower(?) " +
            "ORDER BY oi.id", username);
    }

    private List<OrderItem> query(String sql, String username) throws SQLException {
        try (PreparedStatement ps = connection().prepareStatement(sql)) {
            if (username != null) ps.setString(1, username);
            try (ResultSet rs = ps.executeQuery()) {
                List<OrderItem> out = new ArrayList<>();
                while (rs.next()) {
                    out.add(new OrderItem(
                        rs.getLong(1), rs.getString(2), rs.getString(3), rs.getDouble(4),
                        rs.getString(5), rs.getInt(6), rs.getInt(7), rs.getString(8)));
                }
                return out;
            }
        }
    }

    /** Mark an item delivered in-game, and flip its order to 'delivered' once every item is done. */
    public void markDelivered(long itemId) throws SQLException {
        try (PreparedStatement ps = connection().prepareStatement(
            "UPDATE order_items SET delivered = TRUE, delivered_at = now() WHERE id = ?")) {
            ps.setLong(1, itemId);
            ps.executeUpdate();
        }
        try (PreparedStatement ps = connection().prepareStatement(
            "UPDATE orders o SET delivered_at = now(), updated_at = now(), status = 'delivered' " +
            "WHERE o.status = 'paid' AND EXISTS (" +
            "  SELECT 1 FROM order_items oi WHERE oi.order_id = o.id AND oi.id = ?) " +
            "AND NOT EXISTS (" +
            "  SELECT 1 FROM order_items oi2 WHERE oi2.order_id = o.id AND oi2.delivered = FALSE)")) {
            ps.setLong(1, itemId);
            ps.executeUpdate();
        }
    }
}