/**
 * Refactor Temp: Tool — captureBrowserScreenshot
 * Core, stateless helpers for screenshot capture flow from browser-connector.ts.
 * Keep Express bindings and WebSocket message sending in the main file.
 */

export interface ScreenshotServiceConfig {
  returnImageData: boolean;
  baseDirectory?: string;
}

export interface ScreenshotSaveResult {
  filePath: string;
  filename: string;
  projectDirectory?: string;
  urlCategory?: string;
  imageData?: string;
}

/**
 * Shape successful response payload based on result from ScreenshotService.saveScreenshot
 */
export function buildScreenshotResponse(result: ScreenshotSaveResult) {
  const response: any = {
    filePath: result.filePath,
    filename: result.filename,
    projectDirectory: result.projectDirectory,
    urlCategory: result.urlCategory,
  };

  if (result.imageData) {
    response.imageData = result.imageData;
  }

  return response;
}

/**
 * Build screenshot configuration for the service call (pure function).
 * Prefers projectScreenshotPath, falls back to customPath from extension.
 */
export function buildScreenshotConfig(
  projectScreenshotPath?: string,
  customPath?: string
): ScreenshotServiceConfig {
  return {
    returnImageData: true,
    baseDirectory: projectScreenshotPath || customPath,
  };
}
