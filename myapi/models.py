# question class

from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship

from database import Base

# question class
class Question(Base):
    __tablename__ = "question"

    id = Column(Integer, primary_key=True)
    subject = Column(String, nullable=False)
    content = Column(Text, nullable=False)
    create_date = Column(DateTime, nullable=False)

# answer class
class Answer(Base):
    __tablename__ = "answer"

    id = Column(Integer, primary_key=True)
    content = Column(Text, nullable=False)
    create_date = Column(DateTime, nullable=False)
    question_id = Column(Integer, ForeignKey("question.id"))
    #  => question table의 id 컬럼(0) => question 객체의 속성 id와 다름!!
    question = relationship("Question", backref= "answer")

# 명칭 = 컬럼(/관계) + (type, key 여부= T/F, nullable= T/F,backref = 참조(relation인 경우, 역참조 설정)
#  relation(참조할 모델명, backref= 역참조 = 질문에서 답변을 거꾸로 참조)