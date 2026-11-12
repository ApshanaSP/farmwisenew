import { asciiDigits } from "@/lib/thunai/digits";

/**
 * What a number box keeps of what was typed or pasted: every decimal digit of any script written as 0 to 9 (a Tamil, Devanagari or
 * fullwidth keyboard's digits too), and nothing else. `replace(/\D/g, "")` alone dropped those digits as they were typed: JavaScript's
 * \D is every character but 0 to 9 (QA pass 5, P5-007's sweep; P5-033).
 */
export const typedDigits = (s: string): string => asciiDigits(String(s ?? "")).replace(/\D/g, "");
