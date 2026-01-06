import * as path from 'node:path';
import { loadRepoInstructions, loadPathInstructions } from './loader.js';
/**
 * Convert an absolute path to a relative path from the given directory.
 * If the path is already relative, returns it as-is.
 * Note: This is intentionally NOT exported to avoid OpenCode treating it as a plugin
 */
function getRelativePath(directory, filePath) {
    // Normalize directory path (remove trailing slash)
    const normalizedDir = directory.endsWith('/') ? directory.slice(0, -1) : directory;
    // If path is already relative (doesn't start with /), return as-is
    if (!path.isAbsolute(filePath)) {
        return filePath;
    }
    // Use path.relative to compute relative path
    return path.relative(normalizedDir, filePath);
}
// Tools that work with file paths
const FILE_TOOLS = new Set(['read', 'edit', 'write']);
export const CopilotInstructionsPlugin = async (ctx) => {
    const { directory, client } = ctx;
    // Validate directory is provided and is a string
    if (!directory || typeof directory !== 'string') {
        console.error('[copilot-instructions] Invalid directory:', directory, 'ctx:', Object.keys(ctx));
        throw new Error(`Plugin requires a valid directory string, got: ${typeof directory}`);
    }
    // Store directory in a local const to ensure closure captures it properly
    const projectDir = directory;
    // Load instructions at startup
    const repoInstructions = loadRepoInstructions(projectDir);
    const pathInstructions = loadPathInstructions(projectDir);
    // Helper to log messages
    const log = (message, level = 'info') => {
        client.app.log({
            body: {
                service: 'copilot-instructions',
                level,
                message
            }
        });
    };
    // Log what was loaded
    if (repoInstructions) {
        log('Loaded repo instructions from .github/copilot-instructions.md');
    }
    if (pathInstructions.length > 0) {
        for (const instruction of pathInstructions) {
            const filename = path.basename(instruction.file);
            log(`Loaded path instructions from ${filename}`);
        }
    }
    if (!repoInstructions && pathInstructions.length === 0) {
        log('No Copilot instructions found');
    }
    // Track injected instructions per session
    // Map<sessionID, Set<instructionFile>>
    const injectedPerSession = new Map();
    // Track sessions where we've injected repo instructions
    const repoInstructionsInjected = new Set();
    return {
        // Listen for session.created events to inject repo-wide instructions
        event: async ({ event }) => {
            // Log all events for debugging
            log(`Event received: ${event.type}`, 'debug');
            if (event.type === 'session.created') {
                log(`session.created event received, repoInstructions: ${!!repoInstructions}`);
                log(`Event properties: ${JSON.stringify(event.properties)}`, 'debug');
                if (repoInstructions) {
                    // Session ID is in event.properties.info.id
                    const sessionId = event.properties?.info?.id;
                    log(`Extracted sessionId: ${sessionId}`, 'debug');
                    if (sessionId && !repoInstructionsInjected.has(sessionId)) {
                        repoInstructionsInjected.add(sessionId);
                        log(`Injecting repo instructions into session ${sessionId}`);
                        try {
                            await client.session.prompt({
                                path: { id: sessionId },
                                body: {
                                    noReply: true,
                                    parts: [{
                                            type: 'text',
                                            text: `## Copilot Custom Instructions\n\n${repoInstructions}`
                                        }]
                                }
                            });
                            log(`Successfully injected repo instructions into session ${sessionId}`);
                        }
                        catch (err) {
                            log(`Failed to inject repo instructions: ${err}`);
                        }
                    }
                    else if (!sessionId) {
                        log(`No sessionId found in event.properties`);
                    }
                }
            }
        },
        // Preserve repo-wide instructions during compaction
        'experimental.session.compacting': async (_input, output) => {
            if (repoInstructions) {
                output.context.push(`## Copilot Custom Instructions\n\n${repoInstructions}`);
            }
        },
        'tool.execute.before': async (input, output) => {
            // Only handle file tools
            if (!FILE_TOOLS.has(input.tool)) {
                return;
            }
            // Get file path from args
            const filePath = output.args?.filePath;
            if (!filePath || typeof filePath !== 'string') {
                return;
            }
            // Convert to relative path for matching
            const relativePath = getRelativePath(projectDir, filePath);
            // Find matching instructions that haven't been injected yet
            const sessionInjected = injectedPerSession.get(input.sessionID) ?? new Set();
            injectedPerSession.set(input.sessionID, sessionInjected);
            const matchingInstructions = [];
            for (const instruction of pathInstructions) {
                // Skip if already injected in this session
                if (sessionInjected.has(instruction.file)) {
                    continue;
                }
                // Check if file matches this instruction's patterns
                if (instruction.matcher(relativePath)) {
                    matchingInstructions.push(instruction);
                    sessionInjected.add(instruction.file);
                }
            }
            // Inject matching instructions
            if (matchingInstructions.length > 0) {
                const instructionText = matchingInstructions
                    .map(i => i.content)
                    .join('\n\n');
                // Prepend to existing toolMessage if any
                const existingMessage = output.toolMessage;
                if (existingMessage) {
                    output.toolMessage = `${instructionText}\n\n${existingMessage}`;
                }
                else {
                    output.toolMessage = instructionText;
                }
            }
        }
    };
};
// Default export for easier loading
export default CopilotInstructionsPlugin;
//# sourceMappingURL=index.js.map