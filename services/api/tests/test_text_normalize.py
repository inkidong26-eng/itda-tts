import pytest

from app.text_normalize import _loanword_rules, normalize, sino

CASES = [
    # 09 문서 T08 완료 확인
    ("OK 3시에 봐요", "오케이 세 시에 봐요"),
    # 03 문서 7절 예시
    ("010-1234-5678", "공일공 일이삼사 오육칠팔"),
    ("5,000원이에요", "오천 원이에요"),
    ("2026년에 만나요", "이천이십육 년에 만나요"),
    ("ㅇㅋ 알겠어요", "오케이 알겠어요"),
    ("ㄱㅅ", "감사"),
    ("ㅈㅅ해요", "죄송해요"),
    ("ㅋㅋㅋ", "하하"),
    ("ㅎㅎ", "하하"),
    ("OK 알겠어요 ㅎㅎ", "오케이 알겠어요"),
    ("괜찮아요ㅠㅠ", "괜찮아요"),
    ("좋아요^^ 😊", "좋아요"),
    # 숫자 읽기
    ("10명이 왔어요", "열 명이 왔어요"),
    ("20살이에요", "스무 살이에요"),
    ("21개 주세요", "스물한 개 주세요"),
    ("100명", "백 명"),
    ("3:30에 출발해요", "세 시 삼십 분에 출발해요"),
    ("10:00", "열 시"),
    ("6월 10일", "유월 십 일"),
    ("10월", "시월"),
    ("1번째", "첫 번째"),
    ("2번째 문", "두 번째 문"),
    ("3번 출구", "삼 번 출구"),
    ("50% 할인", "오십 퍼센트 할인"),
    ("1.5km", "일 점 오 킬로미터"),
    ("2kg", "이 킬로그램"),
    ("1,000,000원", "백만 원"),
    ("12345", "만이천삼백사십오"),
    ("0", "영"),
    # 외래어
    ("WiFi 비밀번호 알려 주세요", "와이파이 비밀번호 알려 주세요"),
    ("KakaoTalk 보내 주세요", "카카오톡 보내 주세요"),
    ("Thank you", "땡큐"),
    ("ok", "오케이"),
    ("okay", "오케이"),
    ("5G 돼요?", "파이브지 돼요?"),
    ("5g", "오 그램"),
    ("I like it", "I like it"),  # 소문자 it 는 IT(아이티)로 바꾸지 않음
    ("IT 회사", "아이티 회사"),
]


@pytest.mark.parametrize("text,expected", CASES)
def test_normalize(text, expected):
    assert normalize(text) == expected


@pytest.mark.parametrize("text", ["😊", "ㅠㅠ", "^^", "   "])
def test_nothing_to_read(text):
    assert normalize(text) == ""


@pytest.mark.parametrize("n,expected", [(1, "일"), (10, "십"), (11, "십일"), (110, "백십"), (10000, "만"),
                                        (20000, "이만"), (100000000, "일억"), (2026, "이천이십육")])
def test_sino(n, expected):
    assert sino(n) == expected


def test_loanword_list_has_100_or_more():
    assert len(_loanword_rules()) >= 100
