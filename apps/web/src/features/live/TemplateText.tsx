const WILDCARD = '<*>';

/** A template in monospace, with the parts that vary (<*>) dimmed so the fixed words stand out. */
export default function TemplateText({ template }: { template: string }) {
  let offset = 0;
  const pieces = template.split(WILDCARD).map((text) => {
    const piece = { text, key: offset };
    offset += text.length + WILDCARD.length;
    return piece;
  });
  const lastKey = pieces[pieces.length - 1]?.key;
  return (
    <span className="log-text break-words">
      {pieces.map(({ text, key }) => (
        <span key={key}>
          {text}
          {key !== lastKey && <span className="text-text-muted">&lt;*&gt;</span>}
        </span>
      ))}
    </span>
  );
}
