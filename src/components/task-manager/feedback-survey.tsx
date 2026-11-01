'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import {
  SURVEY_COMMENTS,
  SURVEY_QUESTIONS,
  SURVEY_RATING_KEYS,
  type SurveyCommentKey,
  type SurveyRatingKey,
} from '@/lib/survey-questions'
import { ClipboardCheck, Loader2, LogOut, Send, Sparkles } from 'lucide-react'

const SCORES = [1, 2, 3, 4, 5]

/**
 * Mandatory one-time employee feedback survey.
 *
 * There is deliberately no close button and outside-click / Escape are
 * blocked: the employee must submit the survey (or log out) before using the
 * app. The server enforces the one-submission rule with a unique userId, so
 * the modal can never be used to submit twice.
 */
export function FeedbackSurvey({
  name,
  onDone,
  onLogout,
}: {
  name: string
  onDone: () => void
  onLogout: () => void
}) {
  const [ratings, setRatings] = useState<Record<SurveyRatingKey, number | null>>({
    overall: null,
    easeOfUse: null,
    taskClarity: null,
    notifications: null,
    recommend: null,
  })
  const [comments, setComments] = useState<Record<SurveyCommentKey, string>>({
    likedMost: '',
    improvements: '',
    comments: '',
  })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const answered = SURVEY_RATING_KEYS.filter((key) => ratings[key] !== null).length
  const allAnswered = answered === SURVEY_RATING_KEYS.length

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!allAnswered) {
      setError('Please answer all five rating questions before submitting.')
      return
    }
    setBusy(true)
    try {
      const res = await fetch('/api/survey', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ ...ratings, ...comments }),
      })
      // 409 = already submitted (e.g. from another tab/device). Treat it as
      // done instead of leaving the mandatory modal stuck on an error.
      if (res.ok || res.status === 409) {
        onDone()
        return
      }
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      setError(data.error || `Could not submit your feedback (${res.status}). Please try again.`)
    } catch {
      setError('Could not submit your feedback. Please check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={() => {}}>
      <DialogContent
        showCloseButton={false}
        className="max-h-[92vh] w-[calc(100vw-1.5rem)] max-w-2xl overflow-y-auto"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <div className="mb-1 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-800 text-white shadow-md shadow-brand-200">
            <ClipboardCheck className="h-6 w-6" />
          </div>
          <DialogTitle>One-time feedback survey</DialogTitle>
          <DialogDescription>
            Hi <span className="font-medium text-slate-700">{name}</span> — you have been using Tasknet
            for a month now, and we would love your honest feedback. This survey is{' '}
            <span className="font-medium text-slate-700">mandatory</span> and can be submitted{' '}
            <span className="font-medium text-slate-700">only once</span>, so please take a minute to
            answer all five ratings. Your responses go directly to the management team.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2" aria-hidden="true">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-brand-500 transition-all"
              style={{ width: `${(answered / SURVEY_RATING_KEYS.length) * 100}%` }}
            />
          </div>
          <span className="text-[11px] font-medium text-slate-400 tabular-nums">
            {answered}/{SURVEY_RATING_KEYS.length} rated
          </span>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2.5">
            {SURVEY_QUESTIONS.map((q, index) => {
              const selected = ratings[q.key]
              return (
                <fieldset key={q.key} className="rounded-xl border border-slate-200 bg-white p-3">
                  <legend className="sr-only">{q.label}</legend>
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-slate-800">
                      <span className="mr-1 text-slate-400">{index + 1}.</span>
                      {q.label}
                    </p>
                    {selected !== null && (
                      <span className="shrink-0 rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-700">
                        {selected}/5
                      </span>
                    )}
                  </div>
                  <div className="mt-2 grid grid-cols-5 gap-1.5">
                    {SCORES.map((score) => (
                      <button
                        key={score}
                        type="button"
                        aria-pressed={selected === score}
                        aria-label={`${q.shortLabel}: ${score} out of 5`}
                        onClick={() => setRatings((prev) => ({ ...prev, [q.key]: score }))}
                        className={cn(
                          'h-9 rounded-lg border text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400',
                          selected === score
                            ? 'border-brand-600 bg-brand-600 text-white shadow-sm'
                            : selected !== null && score < selected
                              ? 'border-brand-200 bg-brand-50 text-brand-700'
                              : 'border-slate-200 bg-white text-slate-500 hover:border-brand-300 hover:text-brand-700'
                        )}
                      >
                        {score}
                      </button>
                    ))}
                  </div>
                  <div className="mt-1 flex justify-between text-[10px] text-slate-400">
                    <span>{q.low}</span>
                    <span>{q.high}</span>
                  </div>
                </fieldset>
              )
            })}
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-brand-500" aria-hidden="true" />
              <p className="text-xs font-medium text-slate-500">
                Optional — tell us a little more (comments help us act on the ratings)
              </p>
            </div>
            {SURVEY_COMMENTS.map((c) => (
              <div key={c.key} className="space-y-1.5">
                <label htmlFor={`survey-${c.key}`} className="text-sm font-medium text-slate-700">
                  {c.label}
                </label>
                <Textarea
                  id={`survey-${c.key}`}
                  value={comments[c.key]}
                  onChange={(e) => setComments((prev) => ({ ...prev, [c.key]: e.target.value }))}
                  placeholder={c.placeholder}
                  maxLength={2000}
                  rows={2}
                />
              </div>
            ))}
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
              {error}
            </div>
          )}

          <DialogFooter className="gap-2 sm:justify-between">
            <Button type="button" variant="ghost" onClick={onLogout} className="text-slate-500">
              <LogOut className="mr-2 h-4 w-4" /> Logout
            </Button>
            <Button type="submit" disabled={busy || !allAnswered}>
              {busy ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              Submit feedback
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
