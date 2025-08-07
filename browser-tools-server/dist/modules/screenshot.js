/**
 * Refactor Temp: Tool — captureBrowserScreenshot
 * Core, stateless helpers for screenshot capture flow from browser-connector.ts.
 * Keep Express bindings and WebSocket message sending in the main file.
 */
/**
 * Shape successful response payload based on result from ScreenshotService.saveScreenshot
 */
export function buildScreenshotResponse(result) {
    const response = {
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
export function buildScreenshotConfig(projectScreenshotPath, customPath, projectName) {
    return {
        returnImageData: true,
        baseDirectory: projectScreenshotPath || customPath,
        projectName: projectName,
    };
}
