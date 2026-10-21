"""음성 파일 저장·삭제·주소 만들기는 이 파일에서만 (07 문서 10절).
지금은 서버 디스크(AUDIO_DIR), 사용자가 늘면 클라우드 저장소 + CDN 으로 이 파일만 바꾼다."""

from pathlib import Path


class AudioStorage:
    def __init__(self, directory: Path, public_base: str) -> None:
        self.directory = directory
        self.public_base = public_base
        directory.mkdir(parents=True, exist_ok=True)

    def _path(self, name: str) -> Path:
        # 파일 이름은 캐시 키(16진수)+확장자뿐 → 폴더 밖으로 나갈 수 없게 확인
        if "/" in name or "\\" in name or ".." in name:
            raise ValueError("bad name")
        return self.directory / name

    def save(self, name: str, data: bytes) -> None:
        tmp = self._path(name + ".part")
        tmp.write_bytes(data)
        tmp.replace(self._path(name))  # 다 쓴 뒤에 이름을 바꿔 반쯤 쓴 파일이 보이지 않게

    def exists(self, name: str) -> bool:
        return self._path(name).is_file()

    def delete(self, name: str) -> None:
        self._path(name).unlink(missing_ok=True)

    def url(self, name: str) -> str:
        return f"{self.public_base}/{name}"
