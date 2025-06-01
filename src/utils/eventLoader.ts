import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { Client } from 'discord.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function loadEvents(client: Client): Promise<void> {
  try {
    // Get the events directory path
    const eventsPath = path.join(__dirname, '..', 'events');
    
    // Check if the events directory exists
    if (!fs.existsSync(eventsPath)) {
      client.logger.warn(`Events directory not found at ${eventsPath}`);
      return;
    }
    
    // Get all event files
    const eventFiles = fs.readdirSync(eventsPath)
      .filter(file => file.endsWith('.js') || file.endsWith('.ts'));
    
    let loadedEvents = 0;
    
    for (const file of eventFiles) {
      const filePath = path.join(eventsPath, file);
      
      try {
        // Import the event module
        const eventModule = await import(`file://${filePath}`);
        const event = eventModule.default;
        
        if ('name' in event && 'execute' in event) {
          if (event.once) {
            client.once(event.name, (...args) => event.execute(...args, client));
          } else {
            client.on(event.name, (...args) => event.execute(...args, client));
          }
          
          loadedEvents++;
          client.logger.debug(`Loaded event: ${event.name}`);
        } else {
          client.logger.warn(`Event at ${filePath} is missing required "name" or "execute" property`);
        }
      } catch (error) {
        client.logger.error(`Error loading event from ${filePath}:`, error);
      }
    }
    
    client.logger.info(`Loaded ${loadedEvents} events`);
  } catch (error) {
    client.logger.error('Error loading events:', error);
    throw error;
  }
}