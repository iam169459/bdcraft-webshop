package com.bdcraft.shop;

import com.bdcraft.shop.Database.OrderItem;
import org.bukkit.Bukkit;
import org.bukkit.ChatColor;
import org.bukkit.Material;
import org.bukkit.entity.Player;
import org.bukkit.inventory.ItemStack;

/**
 * Grants money / items / commands to players. All methods must run on the
 * main thread (they touch the player and inventory APIs).
 */
public final class Grant {

    private final BDCraftShop plugin;

    public Grant(BDCraftShop plugin) {
        this.plugin = plugin;
    }

    public boolean deliver(Player player, OrderItem item) {
        if (item.type().equalsIgnoreCase("money")) {
            boolean ok = money(player, item.amount());
            if (ok) plugin.getLogger().info("Delivered " + item.amount() + " coins to " + player.getName());
            return ok;
        }
        return itemDeliver(player, item.material(), item.itemAmount() * Math.max(1, item.qty()), item.command());
    }

    /** Must run on the main thread. */
    public void deliverAll(Player player, java.util.List<OrderItem> items) {
        for (OrderItem item : items) deliver(player, item);
    }

    private boolean money(Player player, double amount) {
        if (amount <= 0) return false;
        if (plugin.vaultEconomy() != null) {
            plugin.vaultEconomy().depositPlayer(player, amount);
        } else {
            String cmd = plugin.getConfig().getString("economy.command", "eco give {player} {amount}")
                .replace("{player}", player.getName())
                .replace("{amount}", String.valueOf((long) amount));
            if (!Bukkit.dispatchCommand(Bukkit.getConsoleSender(), cmd)) return false;
        }
        msg(player, plugin.getConfig().getString("messages.money-granted", "")
            .replace("{amount}", String.valueOf((long) amount)));
        return true;
    }

    private boolean itemDeliver(Player player, String materialName, int count, String commandTemplate) {
        if (commandTemplate != null && !commandTemplate.isBlank()) {
            String cmd = commandTemplate.replace("{player}", player.getName());
            if (!Bukkit.dispatchCommand(Bukkit.getConsoleSender(), cmd)) return false;
            msg(player, plugin.getConfig().getString("messages.command-done", ""));
            plugin.getLogger().info("Dispatched purchase command for " + player.getName() + ": " + cmd);
            return true;
        }
        if (materialName == null || materialName.isBlank()) return false;

        Material material;
        try {
            material = Material.valueOf(materialName.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            plugin.getLogger().warning("Unknown material '" + materialName + "' ordered for " + player.getName());
            return false;
        }

        ItemStack stack = new ItemStack(material, Math.max(1, count));
        var leftover = player.getInventory().addItem(stack);
        if (!leftover.isEmpty()) {
            // Drop what couldn't fit so nothing is lost.
            leftover.values().forEach(item -> player.getWorld().dropItemNaturally(player.getLocation(), item));
        }
        msg(player, plugin.getConfig().getString("messages.item-granted", "")
            .replace("{items}", String.valueOf(count))
            .replace("{material}", material.name()));
        plugin.getLogger().info("Gave " + count + "x " + material.name() + " to " + player.getName());
        return true;
    }

    private void msg(Player player, String text) {
        if (text == null || text.isEmpty()) return;
        player.sendMessage(ChatColor.translateAlternateColorCodes('&', text));
    }
}