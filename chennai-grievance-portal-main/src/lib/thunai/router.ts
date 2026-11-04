/**
 * Which lane a sentence goes down, and which small part of the prompt it needs. Rules decide when they can (most sentences);
 * a tiny model call decides the rest. Three lanes: district (tools, the console, the district's numbers), general (labelled
 * general knowledge, no tools, no district numbers), refuse (privacy.ts and the never-send rule, in code first).
 * Replaces the keyword wall that refused everyday requests like "give me a summary".
 */
import { z } from "zod";
import { asksForbidden, asksPrivate } from "./privacy";
import { districtNounIn, quickScreen } from "./quick";
import type { World } from "./types";

export type Lane = "district" | "general" | "refuse";
export type Bundle = "screens" | "console" | "stage" | "data" | "memory";
export interface Route { lane: Lane | null; bundle: Bundle | null; why: string }

/** a question whose subject is plainly not the district */
const SUBJECTS = /deep learning|machine learning|artificial intelligence|\bai\b|neural network|programming|python|javascript|\bjava\b|coding|cricket|football|\bipl\b|movie|film|actor|actress|song|music|president|prime minister|capital of|bitcoin|crypto|stock market|share price|history of|physics|chemistry|biology|mathematics|chatgpt|facebook|instagram|youtube|recipe|joke|poem|\bstory\b|translate|photosynthesis|gravity|planet|solar system|moon|universe|inventor|invented|world war|tallest|largest country|speed of light|boiling point|square root|கவிதை|பாடல்|கதை சொல்|சினிமா|படம் பற்றி|கிரிக்கெட்|ஜோக்|தலைநகர்|கண்டுபிடித்த|பிரதமர்|ஜனாதிபதி|thalainagar|pradhamar/i;
const GENERAL_SHAPE = /^\s*(what is|what are|whats|what does|who is|who was|who are|define|meaning of|tell me about|how does|how do i|how to|write|calculate|solve|teach me|sing|recommend|என்றால் என்ன|யார்|enna artham)\b|என்றால் என்ன/i;

const CONSOLE = /\b(go to|open the|switch to|take me to|navigate|dark mode|light mode|theme|numbers|click|press|scroll|panel|page|zone \d+|filter|clear filters|close|go back|undo|map mode|layer)\b|(பக்கம்|திற|மூடு|பின்னால்|இருள் பயன்முறை)|\b(page|panel)\s*(ku|la)\b/i;
const STAGE = /\b(this|these|that|those|the (first|second|third|fourth|fifth|last) (one|case)|read (them|it|these)|sort|export|pin|draft)\b|(இதை|இவற்றை|அதை|முதல்|இரண்டாவது|மூன்றாவது)|\b(idha|idhu|adhu|andha)\b/i;
const MEMORY = /\b(remember|remind|note that|make a note|note this|save|saved|workspace|forget|pin|bookmark|keep (this|it))\b|(நினைவில்|நினைவூட்டு|சேமி|சேவ்|பின் செய்|குறித்து வை|மறந்துவிடு)|\b(nyabagam|gnabagam|save pannu|note pannu|pin pannu|ninaivu|vachuko|vechuko)\b/i;
const DATA = /\b(how many|how much|total|count|number of|percent|percentage|price|rate|contact|who is the|officer of|source|feed|fresh|resolution|backlog|follow.?ups?|gaps?|in the news but|verification|queue|stories|unusual|rises?|outliers?|anomal|stand out|stands out|find|search|look up)\b|(எத்தனை|எவ்வளவு|மொத்தம்|விலை|அதிகாரி|தொடர்பு)|\b(ethana|evlo|evvalavu)\b/i;

/** The lane by rules, when they are sure. lane null: the tiny router call decides. */
export function routeByRules(text: string, w: World, stageOpen: boolean): Route {
  if (asksPrivate(text)) return { lane: "refuse", bundle: null, why: "privacy" };
  if (asksForbidden(text)) return { lane: "refuse", bundle: null, why: "never" };
  const district = districtNounIn(text, w);
  if (!district && SUBJECTS.test(text)) return { lane: "general", bundle: null, why: "subject" };
  const bundle = bundleByRules(text, stageOpen);
  if (district || quickScreen(text, w, { noBail: true })) return { lane: "district", bundle, why: "district-noun" };
  if (GENERAL_SHAPE.test(text)) return { lane: null, bundle, why: "general-shape" };
  // an everyday request with nothing of the district in it ("give me a summary", "how does this number come"): the console's own
  return { lane: "district", bundle, why: "default" };
}

export function bundleByRules(text: string, stageOpen: boolean): Bundle {
  if (MEMORY.test(text)) return "memory";
  if (stageOpen && STAGE.test(text)) return "stage";
  if (CONSOLE.test(text)) return "console";
  if (DATA.test(text)) return "data";
  return "screens";
}

export const RouterSchema = z.object({ lane: z.enum(["district", "general", "refuse"]) });
export const ROUTER_SYSTEM = `Classify one sentence said to the Chennai District Collector's console assistant. district: anything about Chennai's incidents, complaints, news, rain, air, reservoirs, prices, departments, zones, or this console. general: general knowledge unrelated to the district. refuse: asks to send, approve or delete something, or for a citizen's private details. Reply as JSON.`;

export const GeneralSchema = z.object({ reply: z.string().describe("one or two short sentences, in the language asked; no figures") });
export const GENERAL_SYSTEM = `You are Jarvis, an assistant to the Chennai District Collector. Answer this general question in one or two short sentences, in the language it was asked (Tamil script for Tamil or Tanglish). Use no numbers, dates or figures at all. Reply as JSON.`;
/** said before a general answer, so it is never taken for the district's data */
export const GENERAL_LABEL = { en: "General knowledge, not district data: ", ta: "பொது அறிவு, மாவட்டத் தரவு அல்ல: " };
export const GENERAL_FALLBACK = { en: "I can't reason about that right now. Ask me about the district: incidents, news, rain, air, reservoirs, prices or departments.", ta: "இதைப் பற்றி இப்போது யோசிக்க முடியவில்லை. மாவட்டத்தைப் பற்றிக் கேளுங்கள்: சம்பவங்கள், செய்திகள், மழை, காற்று, ஏரிகள், விலைகள், துறைகள்." };
