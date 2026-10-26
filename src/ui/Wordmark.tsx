/** "duet" in italic serif; the two dots of the ü-less wordmark are the couple. */
export function Wordmark({ size = 28 }: { size?: number }) {
  return (
    <span className="wordmark" style={{ fontSize: size }} aria-label="Duet">
      <span className="wordmark__dots" aria-hidden="true">
        <i className="dot dot--a" />
        <i className="dot dot--b" />
      </span>
      <span aria-hidden="true" className="display italic">
        duet
      </span>
    </span>
  )
}
