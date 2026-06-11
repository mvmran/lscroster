import { TriangleAlert } from 'lucide-react'

export function FullPageError({ message }: { message: string }) {
  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <div className="flex max-w-md flex-col items-center gap-3 text-center">
        <TriangleAlert className="text-destructive size-8" />
        <h1 className="text-lg font-semibold">Something went wrong</h1>
        <p className="text-muted-foreground text-sm">{message}</p>
      </div>
    </div>
  )
}
