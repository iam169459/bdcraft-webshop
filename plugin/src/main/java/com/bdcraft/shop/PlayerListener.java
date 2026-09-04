package com.bdcraft.shop;

import com.bdcraft.shop.Database.OrderItem;
import org.bukkit.Bukkit;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.player.PlayerJoinEvent;

import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;

/**
 * When a buyer joins, instantly deliver anything they purchased while they
 * were offline. Each item is claimed exclusively with the worker's in-flight
 * set, so nothing is ever granted twice.
 */
public final class PlayerListener implements Listener {

    private final BDCraftShop plugin;

    public PlayerListener(BDCraftShop plugin) {
        this.plugin = plugin;
    }

    @EventHandler(priority = EventPriority.NORMAL)
    public void onJoin(PlayerJoinEvent event) {
        Player player = event.getPlayer();

        Bukkit.getScheduler().runTaskAsynchronously(plugin, () -> {
            List<OrderItem> queued;
            try {
                queued = plugin.database().fetchUndeliveredFor(player.getName());
            } catch (SQLException e) {
                plugin.getLogger().warning("Join lookup failed for " + player.getName() + ": " + e.getMessage());
                return;
            }

            List<OrderItem> mine = new ArrayList<>();
            for (OrderItem item : queued) {
                // If the worker already claimed it, it will deliver it; skip here.
                if (plugin.worker().claim(item.id())) mine.add(item);
            }
            if (mine.isEmpty()) return;

            Bukkit.getScheduler().runTask(plugin, () -> {
                plugin.grant().deliverAll(player, mine);
                Bukkit.getScheduler().runTaskAsynchronously(plugin, () -> {
                    for (OrderItem item : mine) {
                        try {
                            plugin.database().markDelivered(item.id());
                        } catch (SQLException e) {
                            plugin.getLogger().warning("Failed to mark " + item.id() + " delivered: " + e.getMessage());
                        } finally {
                            plugin.worker().release(item.id());
                        }
                    }
                });
            });
        });
    }
}