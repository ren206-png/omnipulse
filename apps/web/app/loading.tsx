export default function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    </div>
  )
}
