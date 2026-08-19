export interface Translations {
  // ===== Navigation / Sidebar =====
  nav_home: string;
  nav_venues: string;
  nav_players: string;
  nav_tournaments: string;
  nav_sessions: string;
  nav_settings: string;
  nav_collapse: string;
  nav_expand_sidebar: string;
  nav_collapse_sidebar: string;

  // ===== Common / Shared =====
  common_cancel: string;
  common_save: string;
  common_delete: string;
  common_edit: string;
  common_add: string;
  shortcuts_open: string;
  shortcuts_title: string;
  shortcuts_hint: string;
  shortcuts_group_scores: string;
  shortcuts_group_dialogs: string;
  shortcuts_group_general: string;
  shortcuts_score_next: string;
  shortcuts_score_confirm: string;
  shortcuts_dialog_close: string;
  shortcuts_dialog_cycle: string;
  shortcuts_general_help: string;
  shortcuts_general_fullscreen: string;
  common_close: string;
  common_back: string;
  common_export: string;
  common_import: string;
  common_search: string;
  common_all: string;
  common_name: string;
  common_first_name: string;
  common_last_name: string;
  common_actions: string;
  common_loading: string;
  common_saving: string;
  common_done: string;
  common_field: string;
  common_fields: string;
  common_courts: string;
  common_round: string;
  common_vs: string;
  common_bye: string;
  common_set: string;
  common_points: string;
  common_wins_abbr: string;
  common_losses_abbr: string;
  common_points_abbr: string;
  common_gender_male: string;
  common_gender_female: string;
  common_gender_male_short: string;
  common_gender_female_short: string;
  common_gender: string;
  common_age: string;
  common_birth_date: string;
  common_club: string;
  common_action_irreversible: string;
  common_more_actions: string;
  common_confirm: string;
  common_delete_permanently: string;
  common_selected: string;
  common_and_more: string;
  common_free: string;
  common_occupied: string;

  // ===== Home Page =====
  home_welcome: string;
  home_subtitle: string;
  home_players_registered: string;
  home_active_tournaments: string;
  home_total_tournaments: string;
  home_running_tournaments: string;
  home_manage_players: string;
  home_new_tournament: string;

  // ===== Players Page =====
  players_title: string;
  players_count: string;
  players_new_player: string;
  players_first_name_placeholder: string;
  players_last_name_placeholder: string;
  players_club_placeholder: string;
  players_search_placeholder: string;
  players_filter_all: string;
  players_filter_men: string;
  players_filter_women: string;
  players_delete_selected: string;
  players_clear_selection: string;
  players_shown_of_total: string;
  players_select_all: string;
  players_empty_hint: string;
  tournaments_empty_hint: string;
  players_none_yet: string;
  players_no_filter_results: string;
  players_delete_confirm_single: string;
  players_delete_confirm_multi: string;
  players_archived_done: string;
  players_restored_done: string;
  players_show_archived: string;
  players_restore: string;
  players_archive_hint: string;
  players_delete_done: string;
  players_delete_blocked: string;

  // ===== Tournaments Page =====
  tournaments_title: string;
  tournaments_active_count: string;
  tournaments_archived_count: string;
  tournaments_archive: string;
  tournaments_archive_button: string;
  tournaments_unarchive: string;
  tournaments_new: string;
  tournaments_none_yet: string;
  tournaments_delete_title: string;
  tournaments_delete_message: string;
  confirm_type_word: string;
  tournaments_delete_confirm_word: string;
  tournaments_best_of: string;
  tournaments_import: string;
  tournaments_import_error: string;
  // Toast text emitted after the venue-resolution step of a template
  // import. Two paths since v2.8.8 (the always-synthesize pipeline):
  // matched existing venue by name / created new venue from the template.
  import_venue_matched: string;
  import_venue_created: string;
  // Export modal: venue-block preview + missing-venue fallback warning.
  template_export_venue_label: string;
  template_export_venue_missing: string;

  // ===== Tournament Create / Edit =====
  tournament_create_title: string;
  tournament_edit_title: string;
  tournament_name: string;
  tournament_name_placeholder: string;
  tournament_play_date: string;
  tournament_start_time: string;
  print_oclock: string;
  tournament_mode: string;
  tournament_format: string;
  tournament_sets_to_win: string;
  tournament_points_per_set: string;
  next_step_label: string;
  next_step_start: string;
  next_step_done: string;
  next_step_assign_court: string;
  next_step_enter_results: string;
  next_step_advance: string;
  next_step_finish: string;
  next_step_round: string;
  next_step_round_of: string;
  score_input_label: string;
  score_error_negative: string;
  score_error_max: string;
  score_error_draw: string;
  score_error_ext_min: string;
  score_error_ext_diff: string;
  score_error_cap: string;
  score_error_tie_impossible: string;
  scoring_description_ext: string;
  scoring_description_hard: string;
  scoring_mode: string;
  scoring_mode_11_hard: string;
  scoring_mode_11_ext: string;
  scoring_mode_15_hard: string;
  scoring_mode_15_ext: string;
  scoring_mode_21_ext: string;
  scoring_sets_to_win: string;
  ko_modal_title: string;
  ko_modal_group_phase_scoring: string;
  ko_modal_use_different: string;
  ko_modal_ko_scoring: string;
  ko_modal_start_button: string;
  tournament_venue: string;
  // Venue is mandatory — these cover the empty-state and validation paths
  tournament_venue_required: string;
  tournament_venue_pick_placeholder: string;
  tournament_venue_no_venues_title: string;
  tournament_venue_no_venues_message: string;
  tournament_venue_create_first: string;
  tournament_halls_courts: string;
  tournament_courts_selected: string;
  // Hint + shortcut shown under the halls section to clarify why
  // hall names + court counts aren't editable inline (they're owned by
  // the venue) and to send the user to the right place to change them.
  tournament_halls_synced_from_venue: string;
  tournament_halls_edit_venue_link: string;
  tournament_num_groups: string;
  tournament_qualify_ko_count: string;
  tournament_ko_size: string;
  tournament_ko_size_hint: string;
  tournament_seeding_enable: string;
  tournament_seeding_hint: string;
  tournament_entry_fee_enable: string;
  tournament_entry_fee_per_person: string;
  tournament_entry_fee_per_team: string;
  tournament_entry_fee_hint_person: string;
  tournament_entry_fee_hint_team: string;
  tournament_min_rest_enable: string;
  tournament_min_rest_hint: string;
  tournament_min_rest_label: string;
  tournament_min_rest_unit: string;
  // Bronze playoff (Spiel um Platz 3) toggle in TournamentCreate
  tournament_enable_third_place: string;
  tournament_enable_third_place_hint: string;
  // Bronze match section labels rendered in BracketView / round selector
  bracket_third_place: string;
  bracket_third_place_short: string;
  // Group progress bar + group badge in CourtOverview queue
  group_progress_title: string;
  group_progress_label: string;
  group_progress_behind_tooltip: string;
  // Per-group match list shown beneath the standings when drilled
  // into a single group on the Gruppen tab
  groups_matches_title: string;
  groups_matches_count: string;
  groups_match_in_progress: string;
  groups_match_not_played: string;
  rest_warning_title: string;
  rest_warning_body: string;
  rest_warning_player_row: string;
  rest_warning_confirm: string;
  rest_warning_cancel: string;
  tournament_player_resting_tooltip: string;
  // Seed badge (Setzplatz) shown next to seeded players
  seed_badge_short: string;
  seed_badge_tooltip: string;
  // Player-on-court conflict (hard block — no bypass)
  player_conflict_title: string;
  player_conflict_body: string;
  player_conflict_row: string;
  outcome_title: string;
  outcome_description: string;
  outcome_reason_legend: string;
  outcome_winner_legend: string;
  outcome_walkover: string;
  outcome_walkover_hint: string;
  outcome_retired: string;
  outcome_retired_hint: string;
  outcome_disqualified: string;
  outcome_disqualified_hint: string;
  outcome_no_match: string;
  outcome_no_match_hint: string;
  outcome_no_sets_note: string;
  outcome_confirm: string;
  outcome_button: string;
  outcome_badge_walkover: string;
  outcome_badge_retired: string;
  outcome_badge_disqualified: string;
  outcome_badge_no_match: string;
  court_taken_title: string;
  court_taken_body: string;
  court_taken_by_other_tournament: string;
  match_blocked_short: string;
  match_player_busy_short: string;
  // Live publishing
  settings_live_publish_section: string;
  settings_live_publish_help: string;
  settings_live_publish_url: string;
  settings_live_publish_url_placeholder: string;
  settings_live_publish_url_insecure: string;
  settings_live_publish_url_malformed: string;
  live_privacy_title: string;
  live_privacy_notice_full: string;
  live_privacy_notice_abbreviated: string;
  live_privacy_notice_no_club: string;
  settings_live_publish_privacy: string;
  settings_live_publish_privacy_hint: string;
  settings_live_publish_privacy_full: string;
  settings_live_publish_privacy_abbreviated: string;
  settings_live_publish_privacy_no_club: string;
  settings_live_publish_secret: string;
  settings_live_publish_secret_placeholder: string;
  settings_live_publish_test: string;
  settings_live_publish_test_ok: string;
  settings_live_publish_test_fail: string;
  settings_live_publish_last_push: string;
  settings_live_publish_save: string;
  settings_live_publish_saved: string;
  settings_live_publish_status_running: string;
  settings_live_publish_no_tournaments: string;
  tournament_live_publish_enable: string;
  tournament_live_publish_active: string;
  tournament_live_publish_enabled: string;
  tournament_live_publish_no_config: string;
  tournament_live_publish_id_hint: string;
  tournament_live_publish_disabled_draft: string;
  // Pause / resume / push-now buttons next to the Live indicator
  tournament_live_publish_pause: string;
  tournament_live_publish_resume: string;
  tournament_live_publish_paused_label: string;
  tournament_live_publish_push_now: string;
  tournament_live_publish_pushed_now: string;
  // Inline push-status — "Push 12s ago" / "Error 2 min ago" / "Backoff …"
  tournament_live_status_pushed_ago: string;
  tournament_live_status_error_ago: string;
  tournament_live_status_backoff: string;
  tournament_live_status_never_pushed: string;
  tournament_live_status_paused_hint: string;
  // Push log section in Settings
  settings_live_publish_log_title: string;
  settings_live_publish_log_empty: string;
  settings_live_publish_log_clear: string;
  settings_live_publish_log_show_all: string;
  settings_live_publish_log_collapse: string;
  settings_live_publish_log_reason_event: string;
  settings_live_publish_log_reason_heartbeat: string;
  settings_live_publish_log_reason_manual: string;
  settings_live_publish_log_reason_final: string;
  tournament_unpublish: string;
  tournament_unpublish_confirm: string;
  tournament_unpublish_done: string;
  tournament_unpublish_failed: string;
  tournament_step_settings: string;
  tournament_step_players: string;
  tournament_step_teams: string;
  tournament_step_seeding: string;
  tournament_step_create: string;
  tournament_select_players: string;
  tournament_select_all: string;
  tournament_select_filtered: string;
  tournament_deselect_all: string;
  tournament_deselect_filtered: string;
  tournament_players_shown: string;
  tournament_players_selected_of: string;
  tournament_no_players_yet: string;
  tournament_no_filter_results: string;
  tournament_continue_to: string;
  tournament_summary: string;
  tournament_summary_name: string;
  tournament_summary_mode: string;
  tournament_summary_rules: string;
  tournament_summary_players: string;
  tournament_summary_teams: string;
  tournament_summary_entry_fee: string;
  tournament_min_players: string;
  tournament_teams_open: string;
  tournament_create_button: string;
  tournament_save_changes: string;
  tournament_restore_suggestion: string;

  // Mode labels
  mode_singles: string;
  mode_doubles: string;
  mode_mixed: string;

  // Format labels
  format_round_robin: string;
  format_elimination: string;
  format_random_doubles: string;
  format_group_ko: string;
  format_swiss: string;
  format_double_elimination: string;
  format_monrad: string;
  format_king_of_court: string;
  format_waterfall: string;

  // Format descriptions
  format_desc_round_robin: string;
  format_desc_elimination: string;
  format_desc_random_doubles: string;
  format_desc_group_ko: string;
  format_desc_swiss: string;
  format_desc_double_elimination: string;
  format_desc_monrad: string;
  format_desc_king_of_court: string;
  format_desc_waterfall: string;

  // Format detailed descriptions (for info modal)
  format_info_title: string;
  format_info_best_for: string;
  format_info_pros: string;
  format_info_cons: string;

  format_detail_round_robin: string;
  format_detail_elimination: string;
  format_detail_random_doubles: string;
  format_detail_group_ko: string;
  format_detail_swiss: string;
  format_detail_double_elimination: string;
  format_detail_monrad: string;
  format_detail_king_of_court: string;
  format_detail_waterfall: string;

  format_best_round_robin: string;
  format_best_elimination: string;
  format_best_random_doubles: string;
  format_best_group_ko: string;
  format_best_swiss: string;
  format_best_double_elimination: string;
  format_best_monrad: string;
  format_best_king_of_court: string;
  format_best_waterfall: string;

  format_pros_round_robin: string;
  format_pros_elimination: string;
  format_pros_random_doubles: string;
  format_pros_group_ko: string;
  format_pros_swiss: string;
  format_pros_double_elimination: string;
  format_pros_monrad: string;
  format_pros_king_of_court: string;
  format_pros_waterfall: string;

  format_cons_round_robin: string;
  format_cons_elimination: string;
  format_cons_random_doubles: string;
  format_cons_group_ko: string;
  format_cons_swiss: string;
  format_cons_double_elimination: string;
  format_cons_monrad: string;
  format_cons_king_of_court: string;
  format_cons_waterfall: string;

  // Monrad specific
  tournament_view_next_monrad_round: string;

  // King of Court / Waterfall specific
  tournament_view_next_kotc_match: string;
  tournament_view_next_waterfall_round: string;

  // Swiss specific
  tournament_swiss_rounds: string;
  tournament_swiss_rounds_hint: string;
  tournament_view_next_swiss_round: string;

  // Double Elimination specific
  tournament_view_advance_bracket: string;

  // Status labels
  status_draft: string;
  status_active: string;
  status_completed: string;
  status_archived: string;

  // Best of labels
  best_of_1: string;
  best_of_3: string;
  best_of_5: string;

  // Groups count
  groups_count: string;

  // Top N

  // ===== Tournament View =====
  tournament_view_edit: string;
  tournament_view_template: string;
  tournament_view_delete: string;
  validation_min_players: string;
  validation_mixed_needs_two_each: string;
  validation_mixed_unbalanced: string;
  validation_doubles_odd_players: string;
  validation_ko_needs_two: string;
  validation_ko_byes: string;
  validation_groups_min: string;
  validation_groups_too_many: string;
  validation_ko_size_too_large: string;
  validation_rounds_min: string;
  validation_rounds_exceed_opponents: string;
  validation_waterfall_sit_out: string;
  validation_kotc_single_court: string;
  validation_round_robin_long: string;
  validation_random_doubles_remainder: string;
  validation_teams_incomplete: string;
  validation_errors_title: string;
  validation_warnings_title: string;
  export_matches_csv: string;
  export_standings_csv: string;
  export_payments_csv: string;
  export_json: string;
  export_done: string;
  export_failed: string;
  tournament_view_round_counter: string;
  tournament_view_round_byes: string;
  tournament_view_start_failed: string;
  tournament_view_start: string;
  tournament_view_next_round: string;
  tournament_view_start_ko: string;
  tournament_view_next_ko_round: string;
  tournament_view_end: string;
  tournament_view_archive: string;
  tournament_view_print: string;
  tournament_view_tv_mode: string;
  tournament_view_not_started: string;
  tournament_view_not_started_hint: string;
  tournament_view_has_open_matches: string;
  tournament_view_ko_phase: string;
  tournament_view_groups_label: string;
  tournament_view_tab_matches: string;
  tournament_view_tab_groups: string;
  tournament_view_tab_bracket: string;
  tournament_view_tab_standings: string;
  tournament_view_tab_management: string;
  tournament_view_on_court: string;
  tournament_view_completed_matches: string;
  tournament_view_assign_court_first: string;
  tournament_view_court_question: string;
  tournament_view_match_completed: string;
  tournament_view_round_label: string;
  tournament_view_announce_title: string;
  tournament_view_edit_results: string;

  // ===== Edit Tournament Modal =====
  edit_tournament_title: string;
  edit_tournament_courts_label: string;
  edit_tournament_groups_count: string;
  edit_tournament_fee_single: string;
  edit_tournament_fee_double: string;
  edit_tournament_saved: string;

  // ===== Delete Tournament Modal =====
  delete_tournament_title: string;
  delete_tournament_message: string;
  delete_tournament_details: string;

  // ===== Retire Player Modal =====
  retire_title: string;
  retire_message: string;
  retire_details: string;
  retire_confirm: string;
  retire_undo: string;
  retire_undo_confirm: string;
  retire_undo_message: string;

  // ===== Template Export Modal =====
  template_export_title: string;
  template_export_description: string;
  template_settings: string;
  template_settings_desc: string;
  template_players: string;
  template_players_desc: string;
  template_teams: string;
  template_teams_desc: string;
  template_export_button: string;

  // ===== Seeding Step =====
  seeding_title: string;
  seeding_groups_hint: string;
  seeding_group_drawn: string;
  release_notes_title: string;
  release_notes_hint: string;
  release_notes_current: string;
  release_notes_german_only: string;
  release_notes_show_all: string;
  draw_preview_title: string;
  draw_preview_title_round: string;
  draw_preview_description: string;
  draw_preview_confirm: string;
  draw_preview_redraw: string;
  draw_preview_round: string;
  draw_preview_group: string;
  draw_preview_bye: string;
  draw_preview_no_matches: string;
  draw_preview_sitting_out: string;
  draw_preview_summary: string;
  draw_preview_no_redraw: string;
  print_card_time: string;
  print_card_winner: string;
  print_card_signature: string;
  print_card_blank_label: string;
  print_mode_scorecards: string;
  print_mode_scorecards_desc: string;
  print_mode_scorecards_blank: string;
  print_mode_scorecards_blank_desc: string;
  seeding_description: string;
  seeding_move_up: string;
  seeding_move_down: string;
  seeding_is_seeded: string;
  seeding_section_seeded: string;
  seeding_section_unseeded: string;
  seeding_unseeded_hint: string;
  seeding_empty_hint: string;

  // ===== Team Pairing Step =====
  teams_title: string;
  teams_count_info: string;
  teams_players_available: string;
  teams_auto_assign: string;
  teams_clear_all: string;
  teams_available: string;
  teams_choose_partner: string;
  teams_women: string;
  teams_men: string;
  teams_label: string;
  teams_remove_title: string;
  teams_player_leftover: string;
  teams_all_assigned: string;

  // ===== Groups Tab =====
  groups_group: string;
  groups_all: string;
  groups_teams_count: string;
  groups_players_count: string;
  groups_player: string;
  groups_team: string;

  // ===== Standings / Rangliste =====
  standings_title: string;
  standings_player: string;
  standings_wins: string;
  standings_losses: string;
  standings_sets_header: string;
  standings_buchholz: string;
  standings_buchholz_hint: string;
  standings_points: string;
  standings_no_results: string;

  // ===== Bracket View =====
  bracket_final: string;
  bracket_semifinal: string;
  bracket_quarterfinal: string;
  bracket_round_of_16: string;
  bracket_round: string;
  bracket_winner: string;
  bracket_winners_bracket: string;
  bracket_losers_bracket: string;

  // ===== Court Overview =====
  court_field: string;
  court_free_drag: string;
  court_waiting: string;
  court_waiting_count: string;
  court_assign: string;
  court_assign_to_match: string;
  court_choose_court: string;
  court_drag_or_double_click: string;
  court_double_click_jump: string;
  court_next_round_separator: string;
  // Right-click context menu on an occupied court card. Action sends
  // the match back to the queue (clears match.court). v2.9.0.
  court_context_menu_unassign: string;
  court_context_menu_unassign_done: string;

  // ===== Court Timer =====
  court_timer_started: string;
  court_timer_critical: string;
  court_timer_warning: string;

  // ===== Verwaltung Tab =====
  management_participants: string;
  management_paid_count: string;
  management_add_player: string;
  management_done: string;
  management_add_player_label: string;
  management_all_players_added: string;
  management_search_placeholder: string;
  management_filter_all: string;
  management_filter_paid: string;
  management_filter_open: string;
  management_shown_of_total: string;
  management_entry_fee: string;
  management_payment_method: string;
  management_payment_date: string;
  management_no_club: string;
  management_paid_count_label: string;
  management_open: string;
  management_paid_amount: string;
  management_open_amount: string;
  management_remove_from_tournament: string;
  management_remove_confirm_title: string;
  management_remove_confirm_message: string;
  management_remove_confirm_hint: string;
  management_remove_confirm_action: string;
  management_retire_title: string;
  management_partner_also_retires: string;
  management_date_placeholder: string;

  // Payment methods
  payment_cash: string;
  payment_transfer: string;
  payment_paypal: string;

  // ===== Excel Import =====
  import_title: string;
  import_step_file: string;
  import_step_mapping: string;
  import_step_preview: string;
  import_step_done: string;
  import_file_hint: string;
  import_choose_file: string;
  import_sheet: string;
  import_rows_found: string;
  import_column_first_name: string;
  import_column_last_name: string;
  import_column_gender: string;
  import_column_age: string;
  import_column_club: string;
  import_please_select: string;
  import_not_available: string;
  import_default_gender: string;
  import_preview_first_rows: string;
  import_empty: string;
  import_will_import: string;
  import_no_name: string;
  import_duplicate: string;
  import_continue_preview: string;
  import_importing: string;
  import_import_button: string;
  import_players_imported: string;

  // ===== Print Dialog =====
  print_title: string;
  print_report: string;
  print_report_desc: string;
  print_full: string;
  print_full_desc: string;
  print_schedule: string;
  print_schedule_desc: string;
  print_current_round: string;
  print_current_round_desc: string;
  print_standings: string;
  print_standings_desc: string;
  print_button: string;
  print_window_blocked: string;

  // ===== Print View =====
  print_participants: string;
  print_group_tables: string;
  print_group: string;
  print_round: string;
  print_ko_round: string;
  print_standings_label: string;
  print_rank: string;
  print_team1: string;
  print_team2: string;
  print_set_n: string;
  print_sets_label: string;
  print_defeats: string;
  print_highlights: string;
  print_most_wins: string;
  print_most_points: string;
  print_closest_match: string;
  print_biggest_win: string;
  print_highest_scoring: string;
  print_longest_match: string;
  print_matches_completed: string;
  print_sets_played: string;
  print_total_points: string;

  // ===== Settings Page =====
  settings_title: string;
  settings_subtitle: string;
  settings_updates: string;
  settings_design: string;
  settings_defaults: string;
  settings_database: string;
  settings_color_scheme: string;
  settings_font_size: string;
  settings_font_family: string;
  settings_language: string;
  settings_club_logo: string;
  settings_logo_upload: string;
  settings_logo_change: string;
  settings_logo_remove: string;
  settings_logo_hint: string;
  settings_logo_crop_title: string;
  settings_logo_crop_hint: string;
  settings_logo_crop_save: string;
  settings_logo_too_large: string;
  settings_logo_cropped_too_large: string;
  settings_timer_thresholds: string;
  settings_timer_warning: string;
  settings_timer_critical: string;
  settings_timer_minutes: string;
  settings_timer_hint: string;
  settings_db_location: string;
  settings_db_open: string;
  settings_db_change: string;
  settings_db_changing: string;
  settings_db_reset_default: string;
  settings_db_browser_mode: string;
  settings_db_path_error: string;
  settings_db_choose_title: string;
  settings_db_copied_message: string;
  settings_db_reset_message: string;
  settings_backup_title: string;
  settings_backup_create: string;
  settings_backup_restore: string;
  settings_backup_hint: string;
  settings_backup_auto_hint: string;
  settings_backup_auto_open: string;
  settings_diagnostics_export: string;
  settings_diagnostics_hint: string;
  settings_diagnostics_saved: string;
  credits_by: string;
  // Errors from the Rust backend
  backend_err_app_dir: string;
  backend_err_backup_dir_failed: string;
  backend_err_backup_failed: string;
  backend_err_backup_missing: string;
  backend_err_backup_not_sqlite: string;
  backend_err_backup_too_new: string;
  backend_err_bad_param: string;
  backend_err_transaction: string;
  backend_err_copy_failed: string;
  backend_err_db_missing: string;
  backend_err_db_unreadable: string;
  backend_err_dir_unknown: string;
  backend_err_file_open_failed: string;
  backend_err_file_read_failed: string;
  backend_err_mkdir_failed: string;
  backend_err_no_connection: string;
  backend_err_open_failed: string;
  backend_err_open_unsupported: string;
  backend_err_path_denied: string;
  backend_err_path_missing: string;
  backend_err_path_unresolved: string;
  backend_err_queue_failed: string;
  backend_err_safety_copy_failed: string;
  backend_err_statement_failed: string;
  backend_err_target_dir_missing: string;
  settings_backup_success: string;
  settings_backup_restore_confirm: string;
  settings_backup_restored: string;
  settings_danger_zone: string;
  settings_delete_all_players: string;
  settings_delete_all_players_hint: string;
  settings_delete_all_tournaments: string;
  settings_delete_all_tournaments_hint: string;
  settings_confirm_title: string;
  settings_confirm_players: string;
  settings_confirm_tournaments: string;
  settings_confirm_word_players: string;
  settings_confirm_word_tournaments: string;
  settings_players_deleted: string;
  settings_tournaments_deleted: string;
  settings_current_version: string;
  settings_check_updates_hint: string;
  settings_checking: string;
  settings_check_updates: string;
  settings_up_to_date: string;
  settings_new_version: string;
  settings_downloading: string;
  settings_install_update: string;
  settings_update_failed: string;

  // Theme names
  theme_emerald: string;
  theme_sapphire: string;
  theme_amber: string;
  theme_osc_night: string;
  theme_osc_split: string;
  theme_night: string;

  // ===== Sportstaetten (Venues) Page =====
  venues_title: string;
  venues_count_singular: string;
  venues_count_plural: string;
  venues_registered: string;
  venues_new: string;
  venues_name_placeholder: string;
  venues_address: string;
  venues_address_placeholder: string;
  venues_zip: string;
  venues_city: string;
  venues_city_placeholder: string;
  venues_halls: string;
  venues_halls_courts: string;
  venues_hall: string;
  venues_add_hall: string;
  venues_search_placeholder: string;
  venues_shown_of_total: string;
  venues_none_yet: string;
  venues_no_filter_results: string;
  venues_delete_title: string;
  venues_hall_singular: string;
  venues_hall_plural: string;
  venues_field_singular: string;
  venues_field_plural: string;
  // In-use guard: a venue referenced by an active/draft tournament or an
  // active session must not be deleted. These cover the modal copy.
  venues_delete_blocked_title: string;
  venues_delete_blocked_message: string;
  venues_delete_blocked_tournaments_label: string;
  venues_delete_blocked_sessions_label: string;
  venues_delete_blocked_resolve_hint: string;

  // ===== TV Mode =====
  tv_courts: string;
  tv_free: string;
  tv_court_label: string;
  tv_recent_results: string;
  tv_queue: string;
  tv_no_waiting: string;
  tv_next_up: string;
  tv_more: string;
  tv_players_round: string;
  tv_please_go_to_court: string;
  tv_keyboard_hint: string;
  tv_phase_group: string;
  tv_phase_ko: string;
  tv_phase_completed: string;
  tv_groups_strip_header: string;

  // ===== Sportstaetten Hall summary =====
  hall_summary: string;

  // ===== Statistics Page =====
  nav_statistics: string;
  stats_title: string;
  stats_subtitle: string;

  stats_tournaments_overview: string;
  stats_by_format: string;
  stats_by_mode: string;

  stats_match_statistics: string;
  stats_total_matches: string;
  stats_avg_duration: string;
  stats_longest_match: string;
  stats_shortest_match: string;
  stats_avg_points_per_set: string;
  stats_closest_match: string;
  stats_total_sets: string;
  stats_total_points: string;
  stats_minutes: string;
  stats_points_diff: string;
  stats_no_duration_data: string;

  stats_court_utilization: string;
  stats_courts_used: string;
  stats_matches_per_court: string;
  stats_avg_matches_per_court: string;

  stats_player_demographics: string;
  stats_gender_split: string;
  stats_age_distribution: string;
  stats_top_clubs: string;
  stats_no_club: string;
  stats_players_total: string;

  stats_player_rankings: string;
  stats_rank: string;
  stats_player: string;
  stats_matches_played: string;
  stats_win_rate: string;
  stats_points_avg: string;
  stats_no_data: string;
  stats_all_tournaments: string;
  stats_filter_tournament: string;

  // ===== Unsaved changes warning =====

  // ===== Database wipe =====
  settings_wipe_database: string;
  settings_wipe_database_hint: string;
  settings_confirm_wipe: string;
  settings_confirm_word_wipe: string;
  settings_wipe_success: string;
  settings_wipe_restarting: string;

  // ===== Undo last round =====
  tournament_view_undo_round: string;
  // Rich undo modal — preview + counts + phase hints + outcome toast
  tournament_view_undo_round_title: string;
  tournament_view_undo_target_label: string;
  tournament_view_undo_match_count: string;
  tournament_view_undo_completed_count: string;
  tournament_view_undo_set_count: string;
  tournament_view_undo_active_count: string;
  tournament_view_undo_phase_to_group: string;
  tournament_view_undo_phase_to_draft: string;
  tournament_view_undo_confirm: string;
  tournament_view_undo_done: string;

  // ===== Reopen tournament =====
  tournament_not_found: string;
  tournament_view_reopen: string;
  tournament_view_reopen_confirm: string;

  // ===== Import fuzzy duplicates =====
  import_fuzzy_match: string;
  import_fuzzy_keep: string;
  import_fuzzy_skip: string;
  import_fuzzy_count: string;

  // ===== Auto-Update Banner =====
  update_available_banner: string;
  update_go_to_settings: string;
  update_dismiss: string;

  // ===== PDF Export & Certificates =====
  pdf_save: string;
  pdf_saving: string;
  certificate_generate: string;
  certificate_achievement: string;
  certificate_place_1: string;
  certificate_place_2: string;
  certificate_place_3: string;
  certificate_date: string;
  certificate_signature: string;
  certificate_congratulations: string;
  certificate_mode: string;
  certificate_format: string;

  // ===== Credits =====
  settings_credits: string;
  settings_credits_idea_and_dev: string;

  // ===== Attendance Check Modal =====
  attendance_title: string;
  attendance_subtitle: string;
  attendance_all_present: string;
  attendance_none_present: string;
  attendance_present_count: string;
  attendance_start: string;
  attendance_min_players: string;

  // ===== Sessions (Multi-Tournament-Workspace) =====
  sessions_title: string;
  sessions_subtitle: string;
  sessions_new: string;
  sessions_none_yet: string;
  sessions_no_active: string;
  sessions_open_dashboard: string;
  sessions_manage: string;
  sessions_end: string;
  sessions_end_confirm: string;
  // Pre-end stats shown inside the confirm modal
  sessions_end_stats_title: string;
  sessions_end_stats_active_tournaments: string;
  sessions_end_stats_on_court: string;
  sessions_end_stats_none: string;
  sessions_end_loading_stats: string;
  // Status suffixes appended to the session pill in TournamentView /
  // Tournaments list when the session has been ended/archived
  session_pill_ended_suffix: string;
  session_pill_archived_suffix: string;
  // Banner shown on the session dashboard when status != active
  session_dashboard_ended_banner: string;
  session_dashboard_archived_banner: string;
  session_dashboard_polling_paused: string;
  // Attach guard messages (UI + thrown error)
  session_attach_blocked_status_hint: string;
  sessions_reactivate: string;
  sessions_archive: string;
  sessions_unarchive: string;
  sessions_delete: string;
  sessions_delete_confirm_title: string;
  sessions_delete_confirm_message: string;
  sessions_filter_active: string;
  sessions_filter_ended: string;
  sessions_filter_archived: string;
  sessions_filter_all: string;
  session_create_title: string;
  session_name_label: string;
  session_name_placeholder: string;
  session_venue_label: string;
  session_venue_none: string;
  session_attach_active_tournaments: string;
  session_attach_active_hint: string;
  session_attach_no_candidates: string;
  session_create_button: string;
  session_detail_title: string;
  session_detail_attached: string;
  session_detail_attached_count: string;
  session_detail_no_tournaments: string;
  session_detail_attach_button: string;
  session_detail_attach_dialog_title: string;
  session_detail_attach_dialog_hint: string;
  session_detail_attach_no_candidates: string;
  session_detail_detach: string;
  session_detail_detach_confirm: string;
  session_detail_open_tournament: string;
  session_status_active: string;
  session_status_ended: string;
  session_status_archived: string;
  session_started_at: string;
  session_ended_at: string;
  session_dashboard_title: string;
  session_dashboard_courts_section: string;
  session_dashboard_queue_section: string;
  session_dashboard_recent_section: string;
  session_dashboard_no_courts: string;
  session_dashboard_no_queue: string;
  session_dashboard_no_recent: string;
  session_dashboard_filter_all_tournaments: string;
  session_dashboard_back_to_session: string;
  session_dashboard_jump_to_tournament: string;
  session_pill_label: string;
  session_pill_open_dashboard: string;
  session_switcher_label: string;
  session_player_busy_in_other: string;
  tournament_create_session_label: string;
  tournament_create_session_none: string;
  tournament_create_session_hint: string;
  sportstaetten_in_use_error: string;
  sportstaetten_active_sessions: string;
}
