const back = (d: string): string => new Date(Date.parse(`${d}T00:00:00Z`) - 864e5).toISOString().slice(0, 10);
/** the last calendar day a window reaches into */
export const lastDayOf = (win: { to: string }): string => (win.to.slice(11) === "00:00:00" ? back(win.to.slice(0, 10)) : win.to.slice(0, 10));
