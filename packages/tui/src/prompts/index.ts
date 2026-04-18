/**
 * Clack integration for pi-tui.
 *
 * Re-exports @clack/prompts for use through the tui package, so coding-agent
 * imports everything from one place. Also provides withClackFlow() for running
 * Clack flows within an active TUI session.
 *
 * Usage from coding-agent:
 *   import { clack } from "@mariozechner/pi-tui";
 *   const name = await clack.text({ message: "Enter name" });
 *
 * Within-session usage:
 *   import { withClackFlow } from "@mariozechner/pi-tui";
 *   const result = await withClackFlow(this.ui, () => clack.select(...));
 */

export * from "@clack/prompts";

import type { TUI } from "../tui.js";

/**
 * Run a Clack flow within an active TUI session.
 *
 * Stops the TUI, runs the flow, clears the screen, then restarts the TUI
 * with a full redraw. This is the correct way to use Clack prompts while
 * a session is running.
 */
export async function withClackFlow<T>(tui: TUI, flow: () => Promise<T>): Promise<T> {
	tui.stop();
	try {
		return await flow();
	} finally {
		tui.terminal.clearScreen();
		tui.start();
		tui.requestRender(true);
	}
}
