// Refactor Temp: Bottom Scaffolding — hosts cleanup, shutdown handlers, trailing listeners/exports
// This file will temporarily collect post-tool, non-tool-specific code moved from browser-connector.ts.

import express from 'express';
import os from 'os';
import { BrowserConnector } from '../browser-connector.js';
import { getAvailablePort, clearAllLogs } from './shared.js';

/**
 * Server startup and initialization logic
 */
export async function startServer(
  app: express.Application,
  REQUESTED_PORT: number,
  currentSettings: { serverHost: string }
): Promise<{ server: any; PORT: number; browserConnector: BrowserConnector }> {
  let PORT: number;

  console.log(`Starting Browser Tools Server...`);
  console.log(`Requested port: ${REQUESTED_PORT}`);

  // Find an available port
  try {
    PORT = await getAvailablePort(REQUESTED_PORT);

    if (PORT !== REQUESTED_PORT) {
      console.log(`\n====================================`);
      console.log(`NOTICE: Requested port ${REQUESTED_PORT} was in use.`);
      console.log(`Using port ${PORT} instead.`);
      console.log(`====================================\n`);
    }
  } catch (portError) {
    console.error(`Failed to find an available port:`, portError);
    process.exit(1);
  }

  // Create the server with the available port
  const server = app.listen(PORT, currentSettings.serverHost, () => {
    console.log(`\n=== Browser Tools Server Started ===`);
    console.log(
      `Aggregator listening on http://${currentSettings.serverHost}:${PORT}`
    );

    if (PORT !== REQUESTED_PORT) {
      console.log(
        `NOTE: Using fallback port ${PORT} instead of requested port ${REQUESTED_PORT}`
      );
    }

    // Log all available network interfaces for easier discovery
    const networkInterfaces = os.networkInterfaces();
    console.log("\nAvailable on the following network addresses:");

    Object.keys(networkInterfaces).forEach((interfaceName) => {
      const interfaces = networkInterfaces[interfaceName];
      if (interfaces) {
        interfaces.forEach((iface) => {
          if (!iface.internal && iface.family === "IPv4") {
            console.log(`  - http://${iface.address}:${PORT}`);
          }
        });
      }
    });

    console.log(`\nFor local access use: http://localhost:${PORT}`);
  });

  // Handle server startup errors
  server.on("error", (err: any) => {
    if (err.code === "EADDRINUSE") {
      console.error(
        `ERROR: Port ${PORT} is still in use, despite our checks!`
      );
      console.error(
        `This might indicate another process started using this port after our check.`
      );
    } else {
      console.error(`Server error:`, err);
    }
    process.exit(1);
  });

  // Initialize the browser connector with the existing app AND server
  const browserConnector = new BrowserConnector(app, server);

  return { server, PORT, browserConnector };
}

/**
 * Setup graceful shutdown handlers
 */
export function setupShutdownHandlers(server: any, browserConnector: BrowserConnector): void {
  // Handle shutdown gracefully with improved error handling
  process.on("SIGINT", async () => {
    console.log("\nReceived SIGINT signal. Starting graceful shutdown...");

    try {
      // First shutdown WebSocket connections
      await browserConnector.shutdown();

      // Then close the HTTP server
      await new Promise<void>((resolve, reject) => {
        server.close((err: any) => {
          if (err) {
            console.error("Error closing HTTP server:", err);
            reject(err);
          } else {
            console.log("HTTP server closed successfully");
            resolve();
          }
        });
      });

      // Clear all logs
      clearAllLogs();

      console.log("Shutdown completed successfully");
      process.exit(0);
    } catch (error) {
      console.error("Error during shutdown:", error);
      // Force exit in case of error
      process.exit(1);
    }
  });

  // Also handle SIGTERM
  process.on("SIGTERM", () => {
    console.log("\nReceived SIGTERM signal");
    process.emit("SIGINT");
  });
}

/**
 * Main server initialization function
 */
export async function initializeServer(
  app: express.Application,
  REQUESTED_PORT: number,
  currentSettings: { serverHost: string }
): Promise<void> {
  try {
    const { server, PORT, browserConnector } = await startServer(app, REQUESTED_PORT, currentSettings);
    setupShutdownHandlers(server, browserConnector);
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

export const bottomScaffold = {
  startServer,
  setupShutdownHandlers,
  initializeServer
};

export default bottomScaffold;
