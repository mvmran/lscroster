import { format } from 'date-fns'
import { ExternalLink, FileText } from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { useNotices } from '@/features/notices/use-notices'

/**
 * Home's notice board: each notice is one line that opens its PDF in a new tab
 * (the browser's own viewer). Hidden while empty, so Home stays as it was for a
 * church that never uses it.
 */
export function NoticeBoardCard() {
  const { data: notices } = useNotices()
  if (!notices || notices.length === 0) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle>Notice Board</CardTitle>
        <CardDescription>Notices and documents from your church.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        {notices.map((notice) => (
          <NoticeLink key={notice.id} notice={notice}>
            <span className="text-muted-foreground text-xs">
              Added {format(new Date(notice.created_at), 'd MMM yyyy')}
            </span>
          </NoticeLink>
        ))}
      </CardContent>
    </Card>
  )
}

/** One notice as a tappable row; `children` sit under the message. */
export function NoticeLink({
  notice,
  children,
}: {
  notice: { message: string; url: string | null }
  children?: React.ReactNode
}) {
  const body = (
    <>
      <FileText className="text-primary mt-0.5 size-5 shrink-0" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="font-medium break-words">{notice.message}</span>
        {children}
      </span>
      {notice.url && <ExternalLink className="text-muted-foreground mt-1 size-4 shrink-0" />}
    </>
  )
  if (!notice.url) {
    return (
      <div
        className="flex min-h-11 items-start gap-3 rounded-md px-2 py-2.5 opacity-60"
        title="This file could not be opened — try again shortly"
      >
        {body}
      </div>
    )
  }
  return (
    <a
      href={notice.url}
      target="_blank"
      rel="noopener noreferrer"
      className="hover:bg-accent/40 flex min-h-11 items-start gap-3 rounded-md px-2 py-2.5"
      title="Open this PDF in a new tab"
    >
      {body}
    </a>
  )
}
