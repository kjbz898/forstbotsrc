import { GuildMember, Client, EmbedBuilder } from 'discord.js';

export default {
  name: 'guildMemberAdd',
  once: false,
  
  async execute(member: GuildMember, client: Client) {
    // Get guild configuration
    const guildConfig = client.db.get(
      'SELECT member_log_channel, join_role, auto_role_enabled FROM guilds WHERE guild_id = ?',
      { guild_id: member.guild.id }
    );
    
    // Log the member join
    if (guildConfig?.member_log_channel) {
      try {
        const logChannel = await member.guild.channels.fetch(guildConfig.member_log_channel);
        
        if (logChannel?.isTextBased()) {
          // Create member join embed
          const joinEmbed = new EmbedBuilder()
            .setTitle('Member Joined')
            .setDescription(`${member.user.tag} (${member.id})`)
            .setColor(0x2ecc71) // Green
            .setThumbnail(member.user.displayAvatarURL())
            .addFields(
              { 
                name: 'Account Created', 
                value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`,
                inline: true 
              },
              { 
                name: 'Member Count', 
                value: `${member.guild.memberCount}`,
                inline: true 
              }
            )
            .setTimestamp();
          
          await logChannel.send({ embeds: [joinEmbed] });
        }
      } catch (error) {
        client.logger.error(`Error logging member join for ${member.id} in ${member.guild.id}:`, error);
      }
    }
    
    // Assign join role if configured
    if (guildConfig?.join_role && guildConfig.auto_role_enabled) {
      try {
        await member.roles.add(guildConfig.join_role);
        client.logger.debug(`Assigned join role ${guildConfig.join_role} to ${member.user.tag} in ${member.guild.name}`);
      } catch (error) {
        client.logger.error(`Error assigning join role to ${member.id} in ${member.guild.id}:`, error);
      }
    }
    
    // Check for raid detection
    checkRaidDetection(member, client);
    
    // Check for alt accounts
    checkAltAccount(member, client);
  },
};

async function checkRaidDetection(member: GuildMember, client: any) {
  try {
    // Get anti-raid configuration
    const antiRaidConfig = client.db.get(
      `SELECT anti_raid_enabled, anti_raid_join_threshold, 
              anti_raid_join_time_window, anti_raid_action, automod_log_channel
       FROM guild_configs WHERE guild_id = ?`,
      { guild_id: member.guild.id }
    );
    
    // Skip if anti-raid is disabled
    if (!antiRaidConfig || !antiRaidConfig.anti_raid_enabled) return;
    
    const now = Date.now();
    const joinTimeWindow = antiRaidConfig.anti_raid_join_time_window;
    const timeThreshold = now - joinTimeWindow;
    
    // Get recent joins within the time window
    const recentJoins = member.guild.members.cache
      .filter(m => m.joinedTimestamp && m.joinedTimestamp > timeThreshold)
      .size;
    
    // Check if the number of recent joins exceeds the threshold
    if (recentJoins >= antiRaidConfig.anti_raid_join_threshold) {
      client.logger.security(`Raid detected in ${member.guild.name}: ${recentJoins} joins in ${joinTimeWindow / 1000}s`, 'high');
      
      // Get or create an active raid log
      let raidLog = client.db.get(
        `SELECT id FROM raid_logs 
         WHERE guild_id = ? AND is_resolved = 0 AND start_time > ?`,
        { guild_id: member.guild.id, start_time: now - (10 * 60 * 1000) } // Last 10 minutes
      );
      
      // If no active raid log, create one
      if (!raidLog) {
        client.db.run(
          `INSERT INTO raid_logs (guild_id, start_time, join_count, is_resolved, created_at)
           VALUES (?, ?, ?, 0, ?)`,
          { guild_id: member.guild.id, start_time: now, join_count: recentJoins, created_at: now }
        );
        
        // Get the created raid log ID
        raidLog = client.db.get(
          `SELECT id FROM raid_logs 
           WHERE guild_id = ? ORDER BY id DESC LIMIT 1`,
          { guild_id: member.guild.id }
        );
      } else {
        // Update the existing raid log
        client.db.run(
          `UPDATE raid_logs SET join_count = ?, updated_at = ? WHERE id = ?`,
          { join_count: recentJoins, updated_at: now, id: raidLog.id }
        );
      }
      
      // Take action based on configuration
      if (antiRaidConfig.anti_raid_action) {
        switch (antiRaidConfig.anti_raid_action) {
          case 'kick':
            // Kick members who joined during the raid
            const recentMembers = member.guild.members.cache
              .filter(m => m.joinedTimestamp && m.joinedTimestamp > timeThreshold);
            
            for (const [id, raidMember] of recentMembers) {
              try {
                await raidMember.kick('Anti-raid protection: Unusual join rate detected');
                client.logger.debug(`Kicked ${raidMember.user.tag} as part of raid protection`);
              } catch (error) {
                client.logger.error(`Failed to kick raid member ${id}:`, error);
              }
            }
            
            // Update raid log with action
            client.db.run(
              `UPDATE raid_logs SET action_taken = ? WHERE id = ?`,
              { action_taken: `Kicked ${recentMembers.size} members`, id: raidLog.id }
            );
            break;
            
          case 'ban':
            // Ban members who joined during the raid
            const recentMembersToBan = member.guild.members.cache
              .filter(m => m.joinedTimestamp && m.joinedTimestamp > timeThreshold);
            
            for (const [id, raidMember] of recentMembersToBan) {
              try {
                await raidMember.ban({ reason: 'Anti-raid protection: Unusual join rate detected' });
                client.logger.debug(`Banned ${raidMember.user.tag} as part of raid protection`);
              } catch (error) {
                client.logger.error(`Failed to ban raid member ${id}:`, error);
              }
            }
            
            // Update raid log with action
            client.db.run(
              `UPDATE raid_logs SET action_taken = ? WHERE id = ?`,
              { action_taken: `Banned ${recentMembersToBan.size} members`, id: raidLog.id }
            );
            break;
            
          case 'verification':
            // Increase verification level temporarily
            try {
              const currentVerificationLevel = member.guild.verificationLevel;
              
              // Only increase if not already at maximum
              if (currentVerificationLevel < 4) { // 4 is VERY_HIGH
                await member.guild.setVerificationLevel(Math.min(currentVerificationLevel + 2, 4));
                
                // Schedule verification level to be reset after 30 minutes
                setTimeout(async () => {
                  try {
                    await member.guild.setVerificationLevel(currentVerificationLevel);
                    client.logger.debug(`Reset verification level in ${member.guild.name}`);
                  } catch (error) {
                    client.logger.error(`Failed to reset verification level in ${member.guild.id}:`, error);
                  }
                }, 30 * 60 * 1000);
                
                // Update raid log with action
                client.db.run(
                  `UPDATE raid_logs SET action_taken = ? WHERE id = ?`,
                  { action_taken: 'Increased verification level temporarily', id: raidLog.id }
                );
              }
            } catch (error) {
              client.logger.error(`Failed to adjust verification level in ${member.guild.id}:`, error);
            }
            break;
            
          case 'alert':
          default:
            // Just log the raid alert
            client.db.run(
              `UPDATE raid_logs SET action_taken = ? WHERE id = ?`,
              { action_taken: 'Alert only', id: raidLog.id }
            );
            break;
        }
      }
      
      // Send alert to log channel if configured
      if (antiRaidConfig.automod_log_channel) {
        try {
          const logChannel = await member.guild.channels.fetch(antiRaidConfig.automod_log_channel);
          
          if (logChannel?.isTextBased()) {
            // Create raid alert embed
            const raidEmbed = new EmbedBuilder()
              .setTitle('⚠️ RAID ALERT ⚠️')
              .setDescription(`Unusual join rate detected: ${recentJoins} members in ${joinTimeWindow / 1000} seconds`)
              .setColor(0xe74c3c) // Red
              .addFields(
                { 
                  name: 'Action Taken', 
                  value: antiRaidConfig.anti_raid_action || 'None',
                  inline: true 
                }
              )
              .setTimestamp();
            
            await logChannel.send({ embeds: [raidEmbed] });
          }
        } catch (error) {
          client.logger.error(`Error sending raid alert to log channel in ${member.guild.id}:`, error);
        }
      }
    }
  } catch (error) {
    client.logger.error(`Error in raid detection for ${member.guild.id}:`, error);
  }
}

async function checkAltAccount(member: GuildMember, client: any) {
  try {
    // Get alt detection configuration
    const altDetectionConfig = client.db.get(
      `SELECT alt_detection_enabled, alt_min_age, alt_action, automod_log_channel
       FROM guild_configs WHERE guild_id = ?`,
      { guild_id: member.guild.id }
    );
    
    // Skip if alt detection is disabled
    if (!altDetectionConfig || !altDetectionConfig.alt_detection_enabled) return;
    
    const accountAge = Date.now() - member.user.createdTimestamp;
    
    // Check if account is newer than the minimum age
    if (accountAge < altDetectionConfig.alt_min_age) {
      client.logger.security(`Alt account detected in ${member.guild.name}: ${member.user.tag} (${accountAge / 86400000} days old)`, 'medium');
      
      // Take action based on configuration
      if (altDetectionConfig.alt_action) {
        switch (altDetectionConfig.alt_action) {
          case 'kick':
            try {
              await member.kick('Alt account detection: Account too new');
              client.logger.debug(`Kicked alt account ${member.user.tag}`);
            } catch (error) {
              client.logger.error(`Failed to kick alt account ${member.id}:`, error);
            }
            break;
            
          case 'ban':
            try {
              await member.ban({ reason: 'Alt account detection: Account too new' });
              client.logger.debug(`Banned alt account ${member.user.tag}`);
            } catch (error) {
              client.logger.error(`Failed to ban alt account ${member.id}:`, error);
            }
            break;
        }
      }
      
      // Send alert to log channel if configured
      if (altDetectionConfig.automod_log_channel) {
        try {
          const logChannel = await member.guild.channels.fetch(altDetectionConfig.automod_log_channel);
          
          if (logChannel?.isTextBased()) {
            // Calculate account age in days
            const accountAgeDays = Math.round(accountAge / (1000 * 60 * 60 * 24) * 10) / 10;
            
            // Create alt account alert embed
            const altEmbed = new EmbedBuilder()
              .setTitle('Alt Account Detected')
              .setDescription(`${member.user.tag} (${member.id})`)
              .setColor(0xf39c12) // Orange
              .setThumbnail(member.user.displayAvatarURL())
              .addFields(
                { 
                  name: 'Account Age', 
                  value: `${accountAgeDays} days`,
                  inline: true 
                },
                { 
                  name: 'Account Created', 
                  value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`,
                  inline: true 
                },
                { 
                  name: 'Action Taken', 
                  value: altDetectionConfig.alt_action || 'None',
                  inline: true 
                }
              )
              .setTimestamp();
            
            await logChannel.send({ embeds: [altEmbed] });
          }
        } catch (error) {
          client.logger.error(`Error sending alt account alert to log channel in ${member.guild.id}:`, error);
        }
      }
    }
  } catch (error) {
    client.logger.error(`Error in alt account detection for ${member.guild.id}:`, error);
  }
}