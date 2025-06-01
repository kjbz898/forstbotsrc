import { REST, Routes } from 'discord.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { Client } from 'discord.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function loadCommands(client: Client): Promise<void> {
  try {
    const commands = [];
    
    // Get the commands directory path
    const commandsPath = path.join(__dirname, '..', 'commands');
    
    // Get all command category folders
    const commandFolders = fs.readdirSync(commandsPath);
    
    for (const folder of commandFolders) {
      // Get all command files in this category
      const categoryPath = path.join(commandsPath, folder);
      
      // Skip if it's not a directory
      if (!fs.statSync(categoryPath).isDirectory()) continue;
      
      const commandFiles = fs.readdirSync(categoryPath)
        .filter(file => file.endsWith('.js') || file.endsWith('.ts'));
      
      for (const file of commandFiles) {
        const filePath = path.join(categoryPath, file);
        
        try {
          // Import the command module
          const commandModule = await import(`file://${filePath}`);
          const command = commandModule.default;
          
          // Set command category based on folder name
          command.category = folder;
          
          // Add command to client commands collection
          if ('data' in command && 'execute' in command) {
            client.commands.set(command.data.name, command);
            commands.push(command.data.toJSON());
            client.logger.debug(`Loaded command: ${command.data.name}`);
          } else {
            client.logger.warn(`Command at ${filePath} is missing required "data" or "execute" property`);
          }
        } catch (error) {
          client.logger.error(`Error loading command from ${filePath}:`, error);
        }
      }
    }
    
    client.logger.info(`Loaded ${commands.length} commands`);
    
    // Deploy commands to Discord
    if (commands.length > 0) {
      await registerCommands(commands, client);
    }
  } catch (error) {
    client.logger.error('Error loading commands:', error);
    throw error;
  }
}

async function registerCommands(commands: any[], client: Client): Promise<void> {
  const token = process.env.DISCORD_TOKEN;
  const clientId = process.env.CLIENT_ID;
  
  if (!token || !clientId) {
    throw new Error('Missing required environment variables (DISCORD_TOKEN, CLIENT_ID)');
  }
  
  try {
    const rest = new REST().setToken(token);
    
    client.logger.info('Started refreshing application (/) commands');
    
    // If DEV_GUILD_ID is provided, register commands to that guild only
    // Otherwise, register globally
    if (process.env.DEV_GUILD_ID) {
      await rest.put(
        Routes.applicationGuildCommands(clientId, process.env.DEV_GUILD_ID),
        { body: commands },
      );
      client.logger.info(`Successfully registered ${commands.length} application commands to development guild`);
    } else {
      // Global command registration (takes up to an hour to propagate)
      await rest.put(
        Routes.applicationCommands(clientId),
        { body: commands },
      );
      client.logger.info(`Successfully registered ${commands.length} global application commands`);
    }
  } catch (error) {
    client.logger.error('Error registering commands:', error);
    throw error;
  }
}