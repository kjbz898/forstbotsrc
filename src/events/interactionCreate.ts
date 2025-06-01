import { Interaction, Client } from 'discord.js';
import { errorEmbed } from '../utils/commandUtils.js';

export default {
  name: 'interactionCreate',
  once: false,
  
  async execute(interaction: Interaction, client: Client) {
    // Handle slash commands
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      
      if (!command) {
        client.logger.warn(`Command ${interaction.commandName} not found`);
        
        return interaction.reply({
          embeds: [errorEmbed('This command is not currently available.')],
          ephemeral: true
        });
      }
      
      try {
        // Log command usage
        client.logger.command(
          interaction.user.id,
          interaction.guildId,
          interaction.commandName
        );
        
        // Execute the command
        await command.execute(interaction);
      } catch (error) {
        client.logger.error(`Error executing command ${interaction.commandName}:`, error);
        
        const errorMessage = `An error occurred while executing this command.${
          (error as Error).message ? `\n\nError: ${(error as Error).message}` : ''
        }`;
        
        // If the interaction has already been replied to or deferred
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({
            embeds: [errorEmbed(errorMessage)],
            ephemeral: true
          }).catch(() => {});
        } else {
          await interaction.reply({
            embeds: [errorEmbed(errorMessage)],
            ephemeral: true
          }).catch(() => {});
        }
      }
    }
    
    // Handle autocomplete interactions
    else if (interaction.isAutocomplete()) {
      const command = client.commands.get(interaction.commandName);
      
      if (!command || !command.autocomplete) return;
      
      try {
        await command.autocomplete(interaction);
      } catch (error) {
        client.logger.error(`Error handling autocomplete for ${interaction.commandName}:`, error);
      }
    }
    
    // Handle button interactions
    else if (interaction.isButton()) {
      // Extract the handler ID from the button customId
      // Format: handlerId:data
      const [handlerId, ...dataParts] = interaction.customId.split(':');
      const data = dataParts.join(':');
      
      // Find the button handler if it exists
      try {
        // Load the button handler dynamically
        const buttonHandler = await import(`../buttons/${handlerId}.js`).catch(() => null);
        
        if (buttonHandler && buttonHandler.default && typeof buttonHandler.default.execute === 'function') {
          await buttonHandler.default.execute(interaction, data, client);
        } else {
          client.logger.warn(`Button handler ${handlerId} not found or invalid`);
          
          await interaction.reply({
            embeds: [errorEmbed('This button is no longer available.')],
            ephemeral: true
          });
        }
      } catch (error) {
        client.logger.error(`Error handling button ${handlerId}:`, error);
        
        await interaction.reply({
          embeds: [errorEmbed('An error occurred while processing this button.')],
          ephemeral: true
        }).catch(() => {});
      }
    }
    
    // Handle select menu interactions
    else if (interaction.isStringSelectMenu()) {
      // Extract the handler ID from the select menu customId
      // Format: handlerId:data
      const [handlerId, ...dataParts] = interaction.customId.split(':');
      const data = dataParts.join(':');
      
      // Find the select menu handler if it exists
      try {
        // Load the select menu handler dynamically
        const selectHandler = await import(`../selects/${handlerId}.js`).catch(() => null);
        
        if (selectHandler && selectHandler.default && typeof selectHandler.default.execute === 'function') {
          await selectHandler.default.execute(interaction, data, client);
        } else {
          client.logger.warn(`Select menu handler ${handlerId} not found or invalid`);
          
          await interaction.reply({
            embeds: [errorEmbed('This select menu is no longer available.')],
            ephemeral: true
          });
        }
      } catch (error) {
        client.logger.error(`Error handling select menu ${handlerId}:`, error);
        
        await interaction.reply({
          embeds: [errorEmbed('An error occurred while processing this select menu.')],
          ephemeral: true
        }).catch(() => {});
      }
    }
    
    // Handle modal submissions
    else if (interaction.isModalSubmit()) {
      // Extract the handler ID from the modal customId
      // Format: handlerId:data
      const [handlerId, ...dataParts] = interaction.customId.split(':');
      const data = dataParts.join(':');
      
      // Find the modal handler if it exists
      try {
        // Load the modal handler dynamically
        const modalHandler = await import(`../modals/${handlerId}.js`).catch(() => null);
        
        if (modalHandler && modalHandler.default && typeof modalHandler.default.execute === 'function') {
          await modalHandler.default.execute(interaction, data, client);
        } else {
          client.logger.warn(`Modal handler ${handlerId} not found or invalid`);
          
          await interaction.reply({
            embeds: [errorEmbed('This modal is no longer available.')],
            ephemeral: true
          });
        }
      } catch (error) {
        client.logger.error(`Error handling modal ${handlerId}:`, error);
        
        await interaction.reply({
          embeds: [errorEmbed('An error occurred while processing this modal.')],
          ephemeral: true
        }).catch(() => {});
      }
    }
  },
};