INSERT INTO videos (youtube_id, title, channel_name, channel_id, duration, language1, language2)
VALUES
  ('dQw4w9WgXcQ', '한국어 회화 연습 - 일상 대화', '한국어 교실', 'UC_korean', 420, 'ko', 'en'),
  ('xvFZjo5PgG0', '뉴스로 배우는 한국어', 'KBS 한국어', 'UC_kbs', 600, 'ko', 'en'),
  ('L_jWHffIx5E', '한국 드라마 명장면 모음', 'K-Drama Clips', 'UC_kdrama', 900, 'ko', 'en');

-- Video 1 captions (Korean)
INSERT INTO captions (video_id, language, idx, begin, end, text)
SELECT id, 'ko', 0, 0.0, 3.5, '안녕하세요 여러분' FROM videos WHERE youtube_id = 'dQw4w9WgXcQ'
UNION ALL SELECT id, 'ko', 1, 3.5, 7.0, '오늘은 일상 대화를 연습해 보겠습니다' FROM videos WHERE youtube_id = 'dQw4w9WgXcQ'
UNION ALL SELECT id, 'ko', 2, 7.0, 10.5, '먼저 인사하는 방법부터 시작하겠습니다' FROM videos WHERE youtube_id = 'dQw4w9WgXcQ'
UNION ALL SELECT id, 'ko', 3, 10.5, 14.0, '처음 만났을 때는 이렇게 말합니다' FROM videos WHERE youtube_id = 'dQw4w9WgXcQ'
UNION ALL SELECT id, 'ko', 4, 14.0, 17.5, '만나서 반갑습니다' FROM videos WHERE youtube_id = 'dQw4w9WgXcQ';

-- Video 1 captions (English)
INSERT INTO captions (video_id, language, idx, begin, end, text)
SELECT id, 'en', 0, 0.0, 3.5, 'Hello everyone' FROM videos WHERE youtube_id = 'dQw4w9WgXcQ'
UNION ALL SELECT id, 'en', 1, 3.5, 7.0, 'Today we will practice everyday conversation' FROM videos WHERE youtube_id = 'dQw4w9WgXcQ'
UNION ALL SELECT id, 'en', 2, 7.0, 10.5, 'First, let''s start with how to greet' FROM videos WHERE youtube_id = 'dQw4w9WgXcQ'
UNION ALL SELECT id, 'en', 3, 10.5, 14.0, 'When you meet someone for the first time, you say this' FROM videos WHERE youtube_id = 'dQw4w9WgXcQ'
UNION ALL SELECT id, 'en', 4, 14.0, 17.5, 'Nice to meet you' FROM videos WHERE youtube_id = 'dQw4w9WgXcQ';

-- Video 2 captions (Korean)
INSERT INTO captions (video_id, language, idx, begin, end, text)
SELECT id, 'ko', 0, 0.0, 4.0, '오늘의 뉴스를 전해드리겠습니다' FROM videos WHERE youtube_id = 'xvFZjo5PgG0'
UNION ALL SELECT id, 'ko', 1, 4.0, 8.0, '경제 분야에서 중요한 소식이 있습니다' FROM videos WHERE youtube_id = 'xvFZjo5PgG0'
UNION ALL SELECT id, 'ko', 2, 8.0, 12.0, '올해 수출이 크게 증가했다고 합니다' FROM videos WHERE youtube_id = 'xvFZjo5PgG0';

-- Video 2 captions (English)
INSERT INTO captions (video_id, language, idx, begin, end, text)
SELECT id, 'en', 0, 0.0, 4.0, 'We will deliver today''s news' FROM videos WHERE youtube_id = 'xvFZjo5PgG0'
UNION ALL SELECT id, 'en', 1, 4.0, 8.0, 'There is important news in the economy' FROM videos WHERE youtube_id = 'xvFZjo5PgG0'
UNION ALL SELECT id, 'en', 2, 8.0, 12.0, 'Exports have increased significantly this year' FROM videos WHERE youtube_id = 'xvFZjo5PgG0';

-- Bookmarks (using subqueries to resolve IDs)
INSERT INTO bookmarks (video_id, caption_id, text, side, offset, translation, context, timestamp, status)
SELECT v.id, c.id, '일상', 0, 9, 'daily life / everyday', '오늘은 일상 대화를 연습해 보겠습니다', 3.5, 'pending'
  FROM videos v JOIN captions c ON c.video_id = v.id AND c.language = 'ko' AND c.idx = 1
  WHERE v.youtube_id = 'dQw4w9WgXcQ';

INSERT INTO bookmarks (video_id, caption_id, text, side, offset, translation, context, timestamp, status)
SELECT v.id, c.id, '인사', 0, 9, 'greeting', '먼저 인사하는 방법부터 시작하겠습니다', 7.0, 'pending'
  FROM videos v JOIN captions c ON c.video_id = v.id AND c.language = 'ko' AND c.idx = 2
  WHERE v.youtube_id = 'dQw4w9WgXcQ';

INSERT INTO bookmarks (video_id, caption_id, text, side, offset, translation, context, timestamp, status)
SELECT v.id, c.id, '반갑습니다', 0, 12, 'nice to meet you (formal)', '만나서 반갑습니다', 14.0, 'learned'
  FROM videos v JOIN captions c ON c.video_id = v.id AND c.language = 'ko' AND c.idx = 4
  WHERE v.youtube_id = 'dQw4w9WgXcQ';

INSERT INTO bookmarks (video_id, caption_id, text, side, offset, translation, context, timestamp, status)
SELECT v.id, c.id, '경제', 0, 0, 'economy', '경제 분야에서 중요한 소식이 있습니다', 4.0, 'pending'
  FROM videos v JOIN captions c ON c.video_id = v.id AND c.language = 'ko' AND c.idx = 1
  WHERE v.youtube_id = 'xvFZjo5PgG0';

INSERT INTO bookmarks (video_id, caption_id, text, side, offset, translation, context, timestamp, status)
SELECT v.id, c.id, '수출', 0, 6, 'export', '올해 수출이 크게 증가했다고 합니다', 8.0, 'pending'
  FROM videos v JOIN captions c ON c.video_id = v.id AND c.language = 'ko' AND c.idx = 2
  WHERE v.youtube_id = 'xvFZjo5PgG0';
