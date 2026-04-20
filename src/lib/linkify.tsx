import React from "react";

// Matches http(s)://... and www.... URLs (stops at whitespace or trailing punctuation)
const URL_REGEX = /((?:https?:\/\/|www\.)[^\s<>"')]+[^\s<>"').,;:!?])/gi;

/**
 * Splits a text string and renders detected URLs as clickable anchors.
 * Preserves whitespace and line breaks (use with `whitespace-pre-wrap` parent).
 */
export function linkifyText(text: string): React.ReactNode[] {
  if (!text) return [];
  const parts = text.split(URL_REGEX);
  return parts.map((part, i) => {
    if (URL_REGEX.test(part)) {
      // reset regex state since we used .test on a global regex
      URL_REGEX.lastIndex = 0;
      const href = part.startsWith("http") ? part : `https://${part}`;
      return (
        <a
          key={i}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline underline-offset-2 hover:text-primary/80 break-all"
        >
          {part}
        </a>
      );
    }
    URL_REGEX.lastIndex = 0;
    return <React.Fragment key={i}>{part}</React.Fragment>;
  });
}
