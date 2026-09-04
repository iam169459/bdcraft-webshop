package com.bdcraft.shop;

import com.bdcraft.shop.Database.OrderItem;
import org.bukkit.Bukkit;
import org.bukkit.entity.Player;
import org.bukkit.scheduler.BukkitTask;

import java.sql.SQLException;
import java.util.List;

/**
 * Polls the (shared Neon) database for paid, undelivered purchases and
 * dispatches them. DB reads run on the async scheduler thread; the actual
 * granting is bounced back to the main thread.
 *
 * An in-memory "in flight" set stops the same item being granted twice if the
 * join listener and this worker happen to pick it up in the same moment.
 */
public final class DeliveryWorker implements Runnable {

    private final BDCraftShop plugin;
    private final java.util.Set<Long> inFlight = java.util.concurrent.ConcurrentHashMap.newKeySet();
    private BukkitTask task;

    public DeliveryWorker(BDCraftShop plugin) {
        this.plugin = plugin;
    }

    public void start() {
        long seconds = plugin.pollSeconds();
        task = Bukkit.getScheduler().runTaskTimerAsynchronously(plugin, this, 20L * 10L, Math.max(60L, seconds * 20L));
    }

    public void stop() {
        if (task != null) task.cancel();
    }

    /** Try to take on an item exclusively. Returns false if already being processed. */
    public boolean claim(long itemId) {
        return inFlight.add(itemId);
    }

    public void release(long itemId) {
        inFlight.remove(itemId);
    }

    @Override
    public void run() {
        List<OrderItem> items;
        try {
            items = plugin.database().fetchUndelivered();
        } catch (SQLException e) {
            plugin.getLogger().warning("DB poll failed: " + e.getMessage());
            return;
        }
        if (items.isEmpty()) return;

        for (OrderItem item : items) {
            if (!claim(item.id())) continue; // someone else is on it
            Player online = findOnline(item.username());
            if (online == null) {
                release(item.id()); // retry on the next poll
                continue;
            }
            grantThenMark(online, item);
        }
    }

    private void grantThenMark(Player player, OrderItem item) {
        // Grant on the main thread...
        Bukkit.getScheduler().runTask(plugin, () -> {
            boolean ok = plugin.grant().deliver(player, item);
            plugin.getServer().getScheduler().runTaskAsynchronously(plugin, () -> {
                try {
                    if (ok) plugin.database().markDelivered(item.id());
                } catch (SQLException e) {
                    plugin.getLogger().warning("Failed to mark order item " + item.id() + " delivered: " + e.getMessage());
                } finally {
                    release(item.id());
                }
            });
        });
    }

    private Player findOnline(String lowercaseName) {
        for (Player p : Bukkit.getOnlinePlayers()) {
            if (p.getName().equalsIgnoreCase(lowercaseName)) return p;
        }
        return null;
    }
}