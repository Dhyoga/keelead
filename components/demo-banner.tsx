export function DemoBanner({
  children = "Demo data: this page shows sample numbers and is not connected to your real leads yet.",
}: {
  children?: React.ReactNode
}) {
  return (
    <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-4 py-2 text-sm text-yellow-300">
      {children}
    </div>
  )
}
