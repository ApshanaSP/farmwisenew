"use client";

/**
 * A password field with exactly one show / hide button (the owner, 28 Nov: "in the password field I get two eye options. One is
 * enough"). Microsoft Edge draws its own eye inside every password input (::-ms-reveal); next to the site's button that made two. The
 * wrapper's class (.pw-field) hides Edge's own one (globals.css), so this button is the only one in every browser. The button is a
 * real <button type="button">: Tab reaches it, Enter or Space toggles it, its name says what it will do ("Show password" /
 * "Hide password"), and it names the field it controls.
 * Used on every password field of the sign-in, sign-up, reset and profile pages; a test checks that no page draws a bare
 * type="password" input of its own (password-reveal.fixall.test.ts).
 */
import { useId, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { Eye, EyeOff } from "lucide-react";
import "@/components/citizen/citizen.css";

export interface PasswordInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  /** what the field holds, for the button's name: "password" gives "Show password" / "Hide password" */
  noun?: string;
  /** an icon inside the field, on the left (the field then needs its own left padding, e.g. pl-11) */
  affix?: ReactNode;
  /** classes for the wrapper */
  wrapClassName?: string;
}

export default function PasswordInput({ noun = "password", affix, className = "", wrapClassName = "", id, ...rest }: PasswordInputProps) {
  const [shown, setShown] = useState(false);
  const auto = useId();
  const inputId = id ?? `pw-${auto.replace(/:/g, "")}`;
  const label = `${shown ? "Hide" : "Show"} ${noun}`;
  return (
    <div className={`pw-field group relative ${wrapClassName}`.trim()}>
      {affix && <span className="input-affix group-focus-within:text-navy-500" aria-hidden="true">{affix}</span>}
      <input {...rest} id={inputId} type={shown ? "text" : "password"} className={`${className} pr-12`.trim()} />
      <button type="button" className="pw-eye" onClick={() => setShown((v) => !v)} aria-label={label} title={label} aria-controls={inputId}>
        {shown ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
      </button>
    </div>
  );
}
