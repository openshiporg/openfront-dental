import { Fragment } from "react";

/** Lets a long address wrap after the @ instead of mid-word: "admin@" / "bayviewfamilydental.com". */
export function emailWithBreak(email: string | null | undefined) {
  if (!email) return null;
  const at = email.indexOf("@");
  if (at < 0) return email;
  return (
    <Fragment>
      {email.slice(0, at + 1)}
      <wbr />
      {email.slice(at + 1)}
    </Fragment>
  );
}
