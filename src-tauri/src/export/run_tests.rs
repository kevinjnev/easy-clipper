use super::run::parse_progress_line;

#[test]
fn parses_progress_lines() {
    assert_eq!(parse_progress_line("out_time_us=1234567"), Some(1_234_567));
    assert_eq!(parse_progress_line("out_time_us=N/A"), None);
    assert_eq!(parse_progress_line("frame=12"), None);
    assert_eq!(parse_progress_line("out_time_us=-5"), Some(0));
}
