-- Aggregated per-player per-competition stats view.
-- Returns one row per (player_name, competition_id) instead of raw predictions,
-- so the history page never hits the Supabase max-rows limit.
-- RLS is inherited from the underlying hist_predictions and hist_matches tables.
create view public.hist_player_comp_stats as
select
  p.player_name,
  m.competition_id,
  count(*)                                                                                  as preds,
  coalesce(sum(p.points), 0)                                                                as total_pts,
  sum(case when p.points = 0 then 1 else 0 end)                                             as zero_count,
  sum(case when p.sign_pred = m.result_sign then 1 else 0 end)                              as correct_results,
  sum(case when p.sign_pred = m.result_sign
           and p.home_pred = m.home_goals
           and p.away_pred = m.away_goals then 1 else 0 end)                                as exact_count,
  sum(case when m.stage in ('AL1','AL2','AL3') then coalesce(p.points,0) else 0 end)        as group_pts,
  sum(case when m.stage in ('AL1','AL2','AL3') then 1 else 0 end)                           as group_n,
  sum(case when m.stage not in ('AL1','AL2','AL3') then coalesce(p.points,0) else 0 end)    as knockout_pts,
  sum(case when m.stage not in ('AL1','AL2','AL3') then 1 else 0 end)                       as knockout_n
from public.hist_predictions p
join public.hist_matches m on m.id = p.match_id
where m.home_goals is not null
group by p.player_name, m.competition_id;
