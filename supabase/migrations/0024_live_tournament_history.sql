-- Migration 0024: surface the live MM2026 tournament on the /history page
-- alongside past competitions, using the same per-player-per-competition shape
-- as hist_player_comp_stats (migration 0016) so the page needs no new query logic.

insert into public.competitions (id, name, type, year)
values ('MM26', 'MM 2026', 'WC', 2026)
on conflict (id) do nothing;

create view public.live_player_comp_stats as
select
  pr.display_name                                                                          as player_name,
  'MM26'::text                                                                              as competition_id,
  count(*)                                                                                  as preds,
  coalesce(sum(sl.points), 0)                                                               as total_pts,
  sum(case when sl.points = 0 then 1 else 0 end)                                            as zero_count,
  sum(case when (sl.breakdown->>'result')::int = 3 then 1 else 0 end)                       as correct_results,
  sum(case when (sl.breakdown->>'result')::int = 3
           and (sl.breakdown->>'home_goals')::int = 1
           and (sl.breakdown->>'away_goals')::int = 1 then 1 else 0 end)                    as exact_count,
  sum(case when m.stage = 'GROUP_STAGE' then coalesce(sl.points, 0) else 0 end)             as group_pts,
  sum(case when m.stage = 'GROUP_STAGE' then 1 else 0 end)                                  as group_n,
  sum(case when m.stage <> 'GROUP_STAGE' then coalesce(sl.points, 0) else 0 end)            as knockout_pts,
  sum(case when m.stage <> 'GROUP_STAGE' then 1 else 0 end)                                 as knockout_n
from public.scoring_log sl
join public.matches m on m.id = sl.match_id
join public.profiles pr on pr.id = sl.user_id
group by pr.display_name;
