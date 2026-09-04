package com.bdcraft.shop;

import org.bukkit.Bukkit;
import org.bukkit.plugin.RegisteredServiceProvider;
import org.bukkit.plugin.java.JavaPlugin;
import net.milkbowl.vault.economy.Economy;

import java.sql.SQLException;

public final class BDCraftShop extends JavaPlugin {

    private Database database;
    private Grant grant;
    private DeliveryWorker worker;
    private Economy vaultEconomy;

    @Override
    public void onEnable() {
        saveDefaultConfig();

        String url = getConfig().getString("database.url", "");
        String user = getConfig().getString("database.user", "");
        String pass = getConfig().getString("database.password", "");
        if (url.isBlank() || url.contains("<host>")) {
            getLogger().severe("database.url is not configured. Edit config.yml (the Neon JDBC string) and restart.");
            Bukkit.getPluginManager().disablePlugin(this);
            return;
        }

        try {
            database = new Database(url, user, pass);
            getLogger().info("Database connection OK. Polling every " + pollSeconds() + "s for purchases.");
        } catch (SQLException e) {
            getLogger().severe("Could not connect to the Neon database: " + e.getMessage());
            getLogger().severe("Double-check database.url / user / password in config.yml.");
            Bukkit.getPluginManager().disablePlugin(this);
            return;
        }

        setupVault();
        grant = new Grant(this);
        worker = new DeliveryWorker(this);
        worker.start();
        Bukkit.getPluginManager().registerEvents(new PlayerListener(this), this);

        getLogger().info("BDCraftShop enabled.");
    }

    @Override
    public void onDisable() {
        if (worker != null) worker.stop();
        if (database != null) {
            try { database.close(); } catch (Exception ignored) {}
        }
    }

    private void setupVault() {
        if (Bukkit.getPluginManager().getPlugin("Vault") == null) {
            getLogger().warning("Vault not found; 'vault' mode will fall back to the configured command.");
        }
        try {
            RegisteredServiceProvider<Economy> rsp =
                Bukkit.getServicesManager().getRegistration(Economy.class);
            if (rsp != null) vaultEconomy = rsp.getProvider();
        } catch (NoClassDefFoundError ignored) {
            // Vault not bundled; command fallback will be used.
        }
    }

    public Database database() { return database; }
    public Grant grant() { return grant; }
    public DeliveryWorker worker() { return worker; }
    public Economy vaultEconomy() { return vaultEconomy; }

    public long pollSeconds() {
        return Math.max(3, getConfig().getLong("database.poll-interval", 10));
    }
}