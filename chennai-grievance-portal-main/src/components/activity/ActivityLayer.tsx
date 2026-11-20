"use client";
/** Immediate feedback for every click on the site. The work is in lib/activity/install.ts. */
import { useEffect } from "react";
import { installActivity } from "@/lib/activity/install";
import { installCursor } from "@/lib/activity/cursor";
import "./activity.css";

export default function ActivityLayer() {
  useEffect(() => { installActivity(); installCursor(); }, []);
  return null;
}
