/** A single rice stem that grows up the right edge of the page as it is read. Purely decorative. */
export default function Stem() {
  const leaves = [0.18, 0.34, 0.5, 0.66, 0.82];
  return (
    <svg className="stem" viewBox="0 0 40 400" aria-hidden="true" focusable="false" data-stem>
      <path className="stem__track" d="M20 396 C 20 300, 18 200, 20 14" />
      <path className="stem__grow" d="M20 396 C 20 300, 18 200, 20 14" data-stem-grow />
      {leaves.map((t, i) => {
        const y = 396 - t * 382;
        const dir = i % 2 === 0 ? 1 : -1;
        return <path key={i} className="stem__leaf" d={`M20 ${y} q ${dir * 16} -4 ${dir * 22} -24 q ${-dir * 14} 6 ${-dir * 22} 24`} data-stem-leaf />;
      })}
      <ellipse className="stem__grain" cx="20" cy="10" rx="4.5" ry="9" data-stem-leaf />
    </svg>
  );
}
