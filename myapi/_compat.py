# _compat.py

# Pydantic 버전 호환성 처리
try:
    from pydantic import BaseModel, Url
    PYDANTIC_V2 = True
except ImportError:
    PYDANTIC_V2 = False

# UndefinedType 정의 (예시)
UndefinedType = type("UndefinedType", (object,), {})

# Url 처리 (예시)
class Url:
    def __init__(self, url: str):
        self.url = url

# _model_dump (예시)
def _model_dump(model):
    return model.dict()
