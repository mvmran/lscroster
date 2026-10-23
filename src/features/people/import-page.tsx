import { useMemo, useState } from 'react'
import { isValid, parse } from 'date-fns'
import { FileUp, Loader2, Upload } from 'lucide-react'
import Papa from 'papaparse'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { z } from 'zod'
import { PageHeader } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatPhone, isValidPhone, PHONE_ERROR } from '@/features/people/phone-utils'
import { peopleKeys, personErrorMessage, usePeople } from '@/features/people/use-people'
import { supabase } from '@/lib/supabase'
import { plural } from '@/lib/utils'
import { useQueryClient } from '@tanstack/react-query'
import type { TablesInsert } from '@/types/database'

const APP_FIELDS = [
  { key: 'firstName', label: 'First name', required: true },
  { key: 'lastName', label: 'Last name', required: true },
  { key: 'email', label: 'Email', required: false },
  { key: 'phone', label: 'Phone', required: false },
  { key: 'birthday', label: 'Birthday', required: false },
  { key: 'notes', label: 'Notes', required: false },
] as const

type AppFieldKey = (typeof APP_FIELDS)[number]['key']
type Mapping = Partial<Record<AppFieldKey, string>>

const SKIP = '__skip__'
// One request, so one transaction — a failure imports nothing rather than the
// first batches, which a retry would then duplicate. Capped to keep that
// request (and the People list it feeds) a sensible size.
const MAX_IMPORT_ROWS = 2000

function guessMapping(headers: string[]): Mapping {
  const mapping: Mapping = {}
  const find = (...needles: string[]) =>
    headers.find((h) => needles.some((n) => h.toLowerCase().includes(n)))
  mapping.firstName = find('first', 'given')
  mapping.lastName = find('last', 'surname', 'family')
  mapping.email = find('email', 'e-mail')
  mapping.phone = find('phone', 'mobile', 'cell')
  mapping.birthday = find('birth', 'dob')
  mapping.notes = find('note', 'comment')
  return mapping
}

/** A 'yyyy-MM-dd' birthday, or null when the text can't be read as one. */
function parseBirthday(trimmed: string): string | null {
  // AU-first: day before month for slashed dates. A two-digit year is read as
  // the nearest such year, and a birthday can't be in the future.
  const now = new Date()
  for (const fmt of ['yyyy-MM-dd', 'dd/MM/yyyy', 'd/M/yyyy', 'dd-MM-yyyy', 'd/M/yy']) {
    const parsed = parse(trimmed, fmt, now)
    if (isValid(parsed) && parsed.getFullYear() > 1900 && parsed <= now) {
      const y = parsed.getFullYear()
      const m = String(parsed.getMonth() + 1).padStart(2, '0')
      const d = String(parsed.getDate()).padStart(2, '0')
      return `${y}-${m}-${d}`
    }
  }
  return null
}

/**
 * A CSV phone the way the person form would take it, or an error. Excel drops
 * a mobile's leading 0 (412 345 678), so that one is put back.
 */
function parsePhone(raw: string): { phone: string | null } | { error: string } {
  const trimmed = raw.trim()
  if (!trimmed) return { phone: null }
  const fixed = /^4\d{8}$/.test(trimmed.replace(/\s/g, '')) ? `0${trimmed}` : trimmed
  if (!isValidPhone(fixed)) return { error: `“${trimmed}” — ${PHONE_ERROR}` }
  return { phone: formatPhone(fixed) }
}

interface PreparedRow {
  index: number
  values: TablesInsert<'people'> | null
  status: 'ok' | 'duplicate-db' | 'duplicate-file' | 'invalid'
  reason?: string
}

interface ImportResult {
  imported: number
  skippedDuplicates: number
  skippedInvalid: number
}

export function ImportPage() {
  // The duplicate check reads the whole directory, so nothing is chosen until
  // it has arrived: against a still-loading (empty) list every row would look
  // new, and the insert would fail on the first existing email.
  const {
    data: people,
    isError: peopleFailed,
    error: peopleError,
    refetch: refetchPeople,
  } = usePeople()
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const [rows, setRows] = useState<Record<string, string>[] | null>(null)
  const [headers, setHeaders] = useState<string[]>([])
  const [fileName, setFileName] = useState('')
  const [mapping, setMapping] = useState<Mapping>({})
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)

  function onFileChosen(file: File | undefined) {
    if (!file) return
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (parsed) => {
        const fields = parsed.meta.fields ?? []
        if (fields.length === 0 || parsed.data.length === 0) {
          toast.error('Could not read any rows from that file')
          return
        }
        setFileName(file.name)
        setHeaders(fields)
        setRows(parsed.data)
        setMapping(guessMapping(fields))
        setResult(null)
      },
      error: () => toast.error('Failed to parse the CSV file'),
    })
  }

  const existingEmails = useMemo(
    () =>
      new Set(
        (people ?? [])
          .map((p) => p.email?.toLowerCase())
          .filter((e): e is string => !!e),
      ),
    [people],
  )

  const prepared: PreparedRow[] = useMemo(() => {
    if (!rows) return []
    const seenEmails = new Set<string>()
    return rows.map((row, index) => {
      const get = (key: AppFieldKey) => {
        const column = mapping[key]
        return column ? (row[column] ?? '').trim() : ''
      }
      const firstName = get('firstName')
      const lastName = get('lastName')
      if (!firstName || !lastName) {
        return {
          index,
          values: null,
          status: 'invalid' as const,
          reason: 'Missing first or last name',
        }
      }
      const rawEmail = get('email').toLowerCase()
      // A typo'd address is a row to fix, not a blank to import quietly: the
      // person couldn't be invited, and the preview would show the typo.
      if (rawEmail && !z.email().safeParse(rawEmail).success) {
        return {
          index,
          values: null,
          status: 'invalid' as const,
          reason: `“${rawEmail}” isn’t a valid email address`,
        }
      }
      // Imported as is, a phone the form rejects would block every later edit
      // of the person; a birthday that can't be read would vanish unseen.
      const phone = parsePhone(get('phone'))
      if ('error' in phone) {
        return { index, values: null, status: 'invalid' as const, reason: phone.error }
      }
      const rawBirthday = get('birthday').trim()
      const birthday = rawBirthday ? parseBirthday(rawBirthday) : null
      if (rawBirthday && !birthday) {
        return {
          index,
          values: null,
          status: 'invalid' as const,
          reason: `Couldn’t read the birthday “${rawBirthday}” — use day/month/year`,
        }
      }
      const email = rawEmail
      if (email) {
        if (existingEmails.has(email)) {
          return {
            index,
            values: null,
            status: 'duplicate-db' as const,
            reason: 'Email already in directory',
          }
        }
        if (seenEmails.has(email)) {
          return {
            index,
            values: null,
            status: 'duplicate-file' as const,
            reason: 'Duplicate email within file',
          }
        }
        seenEmails.add(email)
      }
      return {
        index,
        status: 'ok' as const,
        values: {
          first_name: firstName,
          last_name: lastName,
          email: email || null,
          phone: phone.phone,
          birthday,
          notes: get('notes') || null,
        },
      }
    })
  }, [rows, mapping, existingEmails])

  const importable = prepared.filter((r) => r.status === 'ok')
  const duplicates = prepared.filter(
    (r) => r.status === 'duplicate-db' || r.status === 'duplicate-file',
  )
  const invalid = prepared.filter((r) => r.status === 'invalid')
  const mappingComplete = !!mapping.firstName && !!mapping.lastName
  const overCap = importable.length > MAX_IMPORT_ROWS

  async function runImport() {
    setImporting(true)
    try {
      const values = importable.map((r) => r.values!)
      const { error, status } = await supabase.from('people').insert(values)
      // No answer (status 0), or a gateway error with no database error code
      // (a 502/504 page): the insert may have committed. Saying "nothing was
      // imported" would invite a retry that adds every email-less row twice.
      if (error && (status === 0 || (status >= 500 && !error.code))) {
        toast.error(
          'The server didn’t confirm the import, so it may have been saved. Check the People list before importing again — people without an email would be added twice.',
          { duration: Infinity, closeButton: true },
        )
        return
      }
      if (error) throw new Error(personErrorMessage(error))
      setResult({
        imported: values.length,
        skippedDuplicates: duplicates.length,
        skippedInvalid: invalid.length,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Import failed'
      toast.error(`Nothing was imported — ${message}`)
    } finally {
      // Either way, so the duplicate check reads the directory as it is now.
      await queryClient.invalidateQueries({ queryKey: peopleKeys.all })
      setImporting(false)
    }
  }

  if (result) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        <PageHeader title="Import people" backTo="/people" backLabel="People" />
        <Card>
          <CardHeader>
            <CardTitle>Import complete</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 text-sm">
            <p>
              <strong>{plural(result.imported, 'record')}</strong> imported
              {result.skippedDuplicates > 0 && (
                <>
                  , <strong>{plural(result.skippedDuplicates, 'duplicate')}</strong> skipped
                </>
              )}
              {result.skippedInvalid > 0 && (
                <>
                  , <strong>{plural(result.skippedInvalid, 'invalid row')}</strong> skipped
                </>
              )}
              .
            </p>
            <div className="flex gap-2">
              <Button onClick={() => navigate('/people')}>Go to People</Button>
              <Button
                variant="outline"
                onClick={() => {
                  // Both: the result screen shows while `result` is set.
                  setResult(null)
                  setRows(null)
                }}
              >
                Import another file
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <PageHeader title="Import people" backTo="/people" backLabel="People" />

      {!rows ? (
        <Card>
          <CardHeader>
            <CardTitle>Upload a CSV file</CardTitle>
            <CardDescription>
              Export your congregation list as CSV from a spreadsheet. The first
              row must be column headings (e.g. First name, Last name, Email).
            </CardDescription>
          </CardHeader>
          <CardContent>
            {people ? (
              <label className="border-muted-foreground/25 hover:bg-accent/50 flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed p-10 text-center transition-colors">
                <FileUp className="text-muted-foreground size-8" />
                <span className="text-sm font-medium">
                  Choose a CSV file
                </span>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={(e) => onFileChosen(e.target.files?.[0])}
                />
              </label>
            ) : peopleFailed ? (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <p className="text-destructive">
                  Couldn’t load the directory to check for duplicates (
                  {peopleError.message}).
                </p>
                <Button variant="outline" size="sm" onClick={() => void refetchPeople()}>
                  Try again
                </Button>
              </div>
            ) : (
              <p className="text-muted-foreground flex items-center gap-2 p-10 text-sm">
                <Loader2 className="size-4 animate-spin" />
                Loading the directory to check for duplicates…
              </p>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Map columns</CardTitle>
              <CardDescription>
                {fileName} · {rows.length} rows. Match your CSV columns to
                directory fields. First and last name are required.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {APP_FIELDS.map((field) => (
                <div key={field.key} className="flex flex-col gap-2">
                  <Label>
                    {field.label}
                    {field.required && <span className="text-destructive"> *</span>}
                  </Label>
                  <Select
                    value={mapping[field.key] ?? SKIP}
                    onValueChange={(v) =>
                      setMapping((m) => ({
                        ...m,
                        [field.key]: v === SKIP ? undefined : v,
                      }))
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={SKIP}>— don't import —</SelectItem>
                      {headers.map((h) => (
                        <SelectItem key={h} value={h}>
                          {h}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Preview</CardTitle>
              <CardDescription>
                <Badge variant="secondary" className="mr-1">
                  {importable.length} to import
                </Badge>
                {duplicates.length > 0 && (
                  <Badge variant="outline" className="mr-1">
                    {duplicates.length} duplicates skipped
                  </Badge>
                )}
                {invalid.length > 0 && (
                  <Badge variant="destructive">{invalid.length} invalid</Badge>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Birthday</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {prepared.slice(0, 8).map((row) => {
                    const source = rows[row.index]
                    const name = row.values
                      ? `${row.values.first_name} ${row.values.last_name}`
                      : `${mapping.firstName ? source[mapping.firstName] : ''} ${mapping.lastName ? source[mapping.lastName] : ''}`.trim() ||
                        '—'
                    return (
                      <TableRow key={row.index}>
                        <TableCell className="font-medium">{name}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {row.values?.email ??
                            (mapping.email ? source[mapping.email] : '') ??
                            '—'}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {row.values?.phone ?? '—'}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {row.values?.birthday ?? '—'}
                        </TableCell>
                        <TableCell>
                          {row.status === 'ok' ? (
                            <span className="text-muted-foreground">Ready</span>
                          ) : (
                            <Badge
                              variant={
                                row.status === 'invalid' ? 'destructive' : 'outline'
                              }
                            >
                              {row.reason}
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
              {prepared.length > 8 && (
                <p className="text-muted-foreground border-t px-4 py-2 text-xs">
                  …and {prepared.length - 8} more rows
                </p>
              )}
            </CardContent>
          </Card>

          <div className="flex items-center justify-between gap-2">
            <Button variant="outline" onClick={() => setRows(null)}>
              Choose a different file
            </Button>
            <Button
              onClick={runImport}
              disabled={
                !people ||
                !mappingComplete ||
                importable.length === 0 ||
                overCap ||
                importing
              }
            >
              {importing ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Upload className="size-4" />
              )}
              Import {plural(importable.length, 'record')}
            </Button>
          </div>
          {overCap && (
            <p className="text-destructive -mt-4 text-sm">
              That’s {importable.length.toLocaleString()} records — import at
              most {MAX_IMPORT_ROWS.toLocaleString()} at a time. Split the file and import
              each part.
            </p>
          )}
          {!mappingComplete && (
            <p className="text-muted-foreground -mt-4 text-sm">
              Map the first and last name columns to continue.{' '}
              <Link to="/people" className="underline">
                Cancel
              </Link>
            </p>
          )}
        </>
      )}
    </div>
  )
}
