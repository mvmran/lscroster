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
import { formatPhone } from '@/features/people/phone-utils'
import { peopleKeys, usePeople } from '@/features/people/use-people'
import { supabase } from '@/lib/supabase'
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
const BATCH_SIZE = 100

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

function parseBirthday(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  // AU-first: day before month for slashed dates.
  for (const fmt of ['yyyy-MM-dd', 'dd/MM/yyyy', 'd/M/yyyy', 'dd-MM-yyyy']) {
    const parsed = parse(trimmed, fmt, new Date())
    if (isValid(parsed) && parsed.getFullYear() > 1900) {
      const y = parsed.getFullYear()
      const m = String(parsed.getMonth() + 1).padStart(2, '0')
      const d = String(parsed.getDate()).padStart(2, '0')
      return `${y}-${m}-${d}`
    }
  }
  return null
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
  const { data: people } = usePeople()
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
      const email = z.email().safeParse(rawEmail).success ? rawEmail : ''
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
          phone: formatPhone(get('phone')) || null,
          birthday: parseBirthday(get('birthday')),
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

  async function runImport() {
    setImporting(true)
    try {
      let imported = 0
      const values = importable.map((r) => r.values!)
      for (let i = 0; i < values.length; i += BATCH_SIZE) {
        const batch = values.slice(i, i + BATCH_SIZE)
        const { error } = await supabase.from('people').insert(batch)
        if (error) throw new Error(error.message)
        imported += batch.length
      }
      await queryClient.invalidateQueries({ queryKey: peopleKeys.all })
      setResult({
        imported,
        skippedDuplicates: duplicates.length,
        skippedInvalid: invalid.length,
      })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Import failed')
    } finally {
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
              <strong>{result.imported}</strong> people imported
              {result.skippedDuplicates > 0 && (
                <>
                  , <strong>{result.skippedDuplicates}</strong> duplicates skipped
                </>
              )}
              {result.skippedInvalid > 0 && (
                <>
                  , <strong>{result.skippedInvalid}</strong> invalid rows skipped
                </>
              )}
              .
            </p>
            <div className="flex gap-2">
              <Button onClick={() => navigate('/people')}>Go to People</Button>
              <Button variant="outline" onClick={() => setRows(null)}>
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
            <label className="border-muted-foreground/25 hover:bg-accent/50 flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed p-10 text-center transition-colors">
              <FileUp className="text-muted-foreground size-8" />
              <span className="text-sm font-medium">
                Choose a CSV file or drop it here
              </span>
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => onFileChosen(e.target.files?.[0])}
              />
            </label>
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
              disabled={!mappingComplete || importable.length === 0 || importing}
            >
              {importing ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Upload className="size-4" />
              )}
              Import {importable.length} people
            </Button>
          </div>
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
