import { formatDate } from '@/lib/utils'
import { getCountry, flagUrl, groupLabel } from '@/lib/countries'
import CountdownTimer from './CountdownTimer'
import PredictionForm from './PredictionForm'

interface Match {
  id: number
  home_team: string
  away_team: string
  kickoff_at: string
  status: string
  home_score: number | null
  away_score: number | null
  group_name: string | null
}

interface Prediction {
  home_score_pred: number
  away_score_pred: number
  points: number | null
}

interface Props {
  match: Match
  prediction?: Prediction
}

function TeamName({ englishName }: { englishName: string }) {
  const { name, code } = getCountry(englishName)
  return (
    <span className="inline-flex items-center gap-1">
      {code && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={flagUrl(code)}
          alt={name}
          width={20}
          height={15}
          className="inline-block rounded-sm shrink-0"
          style={{ imageRendering: 'auto' }}
        />
      )}
      {name}
    </span>
  )
}

export default function MatchCard({ match, prediction }: Props) {
  const deadline = new Date(new Date(match.kickoff_at).getTime() - 5 * 60 * 1000)
  const kickoffPassed = new Date(match.kickoff_at) <= new Date()
  const predictionsClosed = deadline <= new Date()
  const hasResult = match.home_score !== null && match.away_score !== null
  const isPostponed = match.status === 'POSTPONED'
  const isCancelled = match.status === 'CANCELLED'
  const group = groupLabel(match.group_name)

  return (
    <div className="bg-white rounded-lg border border-gray-200 px-4 py-3">
      {/* Match header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm flex items-center gap-1 flex-wrap">
            <TeamName englishName={match.home_team} />
            <span className="text-gray-400">–</span>
            <TeamName englishName={match.away_team} />
          </div>
          <div className="text-xs text-gray-400 mt-0.5">
            {formatDate(match.kickoff_at)}
            {group && ` · ${group}`}
          </div>
        </div>

        <div className="text-right shrink-0">
          {hasResult ? (
            <span className="font-bold text-sm">{match.home_score}–{match.away_score}</span>
          ) : isCancelled ? (
            <span className="text-xs bg-red-100 text-red-700 rounded px-1.5 py-0.5">Peruttu</span>
          ) : isPostponed ? (
            <span className="text-xs bg-yellow-100 text-yellow-700 rounded px-1.5 py-0.5">Lykätty</span>
          ) : kickoffPassed ? (
            <span className="text-xs text-gray-400">Käynnissä</span>
          ) : predictionsClosed ? (
            <span className="text-xs text-gray-400">Suljettu</span>
          ) : (
            <CountdownTimer deadlineAt={deadline.toISOString()} />
          )}
        </div>
      </div>

      {/* Prediction row */}
      {!isCancelled && (
        <div className="mt-2 pt-2 border-t border-gray-100">
          {hasResult ? (
            prediction ? (
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500 text-xs">
                  Veikkauksesi: <span className="font-bold text-gray-700">
                    {prediction.home_score_pred}–{prediction.away_score_pred}
                  </span>
                </span>
                {prediction.points !== null && (
                  <span className={`text-xs font-bold ${prediction.points > 0 ? 'text-green-600' : 'text-gray-400'}`}>
                    {prediction.points} p
                  </span>
                )}
              </div>
            ) : (
              <p className="text-xs text-gray-300">Et veikannut tätä ottelua</p>
            )
          ) : predictionsClosed || isPostponed ? (
            prediction ? (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-xs text-gray-400">Veikkauksesi:</span>
                <span className="font-bold text-gray-700">
                  {prediction.home_score_pred}–{prediction.away_score_pred}
                </span>
                <span className="text-xs text-gray-300">(lukittu)</span>
              </div>
            ) : (
              <p className="text-xs text-gray-300">Et veikannut tätä ottelua</p>
            )
          ) : (
            <PredictionForm
              matchId={match.id}
              initialHome={prediction?.home_score_pred}
              initialAway={prediction?.away_score_pred}
            />
          )}
        </div>
      )}
    </div>
  )
}
