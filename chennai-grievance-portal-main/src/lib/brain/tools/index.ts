/** Every tool of the brain, in the order the model reads them. */
import type { BrainTool } from "../types";
import { incidentsTool } from "./incidents";
import { newsTool, openTool, searchTool } from "./records";
import { briefingTool, dashboardTool, evidenceTool } from "./panels";
import { cityTool, contactsTool, facilitiesTool, mapTool, pricesTool, readingsTool, studioTool } from "./live";
import { calcTool, consoleTool, guideTool, schemaTool, screenTool, sqlTool, stageTool, workspaceTool } from "./meta";
import { boardTool } from "./board";

export const TOOLS: BrainTool[] = [incidentsTool, briefingTool, dashboardTool, boardTool, newsTool, openTool, searchTool, readingsTool, cityTool, pricesTool, contactsTool, facilitiesTool, mapTool, studioTool, guideTool, evidenceTool,
  schemaTool, sqlTool, calcTool, consoleTool, stageTool, screenTool, workspaceTool];
