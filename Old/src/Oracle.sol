// SPDX-License-Identifier: GPL-3.0
pragma solidity >=0.6.0;
pragma experimental ABIEncoderV2;

// Import the library implementing the machine template here.
import "./Machine.template.sol";

interface IOracle {

  // questionKey is initialStateHash
  struct Question {
    uint askTime;
    uint timeout;
    bytes32[] answerKeys;
    uint numberOfUnfalsifiedAnswers;
    function(bytes32, Machine.Image memory) external successCallback;
    function(bytes32) external failCallback;
  }

  // answerKey is imageHash
  struct Answer {
    address answerer;
    uint indexInQuestionArray;
    bytes32 questionKey;
  }

  event NewQuestion (
    bytes32 questionKey,
    Machine.Seed seed,
    address asker
  );

  event NewAnswer (
    bytes32 questionKey,
    bytes32 answerKey
  );

  event AnswerFalsified (
    bytes32 questionKey,
    bytes32 answerKey
  );

  event QuestionResolvedSuccessfully (
    bytes32 questionKey,
    Machine.Image image
  );

  event QuestionResolvedUnsuccessfully (
    bytes32 questionKey
  );

  function getQuestion (
    bytes32 questionKey
  ) external view returns (Question memory);

  function getAnswer (
    bytes32 answerKey
  ) external view returns (Answer memory);

  function ask (
    Machine.Seed calldata seed,
    uint timeout,
    function(bytes32, Machine.Image memory) external successCallback,
    function(bytes32) external failCallback
  ) external;

  function answer (
    bytes32 questionKey,
    bytes32 imageHash
  ) external payable;

  // only Court
  function falsify (
    bytes32 answerKey,
    address prosecutor
  ) external;

  function resolveSuccess (
    bytes32 answerKey,
    Machine.Image calldata image
  ) external;

  function resolveFail (
    bytes32 questionKey
  ) external;
}

contract Oracle is IOracle {
  mapping (bytes32 => Question) public questions;
  mapping (bytes32 => Answer) public answers;

  address public court;
  uint public STAKE_SIZE;
  uint public MAX_ANSWER_NUMBER;

  constructor(uint _stake_size, uint _max_answer_number, address _court) public {
    court = _court;
    STAKE_SIZE = _stake_size;
    MAX_ANSWER_NUMBER = _max_answer_number;
  }

  function getQuestion (
    bytes32 questionKey
  ) override external view returns (Question memory)
  {
    return questions[questionKey];
  }

  function getAnswer (
    bytes32 answerKey
  ) override external view returns (Answer memory)
  {
    return answers[answerKey];
  }

  function ask (
    Machine.Seed calldata seed,
    uint timeout,
    function(bytes32, Machine.Image memory) external successCallback,
    function(bytes32) external failCallback
  ) override external
  {
    bytes32 questionKey = Machine.stateHash(Machine.create(seed));
    Question storage question = questions[questionKey];

    require(!_questionExists(questionKey), "Question already exists.");
    require(timeout > 0 && (2 * timeout) + now > (2 * timeout), "Timeout must be greater then zero and be in overflow bounds.");

    question.askTime = now;
    question.timeout = timeout;
    question.successCallback = successCallback;
    question.failCallback = failCallback;

    emit NewQuestion(questionKey, seed, msg.sender);
  }

  function answer (
    bytes32 questionKey,
    bytes32 imageHash
  ) override external payable
  {
    Question storage question = questions[questionKey];
    Answer storage answer = answers[imageHash];

    require(msg.value >= STAKE_SIZE, "Not enough stake sent.");
    require(_questionExists(questionKey), "Question does not exist.");
    require(!_answerExists(imageHash), "Answer already exists.");
    require(_enoughTimeForAnswer(questionKey), "There is not enough time left for submitting new answers to this question.");
    require(question.numberOfUnfalsifiedAnswers < MAX_ANSWER_NUMBER, "All the answer slots are full, wait until wrong answers will be falsified.");

    answer.indexInQuestionArray = question.answerKeys.length;
    question.answerKeys.push(imageHash);
    question.numberOfUnfalsifiedAnswers++;

    answer.answerer = msg.sender;
    answer.questionKey = questionKey;

    emit NewAnswer(questionKey, imageHash);
  }

  function falsify (
    bytes32 answerKey,
    address prosecutor
  ) override external
  {
    Answer storage answer = answers[answerKey];

    require(_answerExists(answerKey), "The answer trying to be falsified does not exist or was already falsified.");
    require(msg.sender == court, "Only court can falsify answers");

    bytes32 questionKey = answer.questionKey;
    _removeAnswer(answerKey);

    payable(prosecutor).call{value: STAKE_SIZE}("");

    emit AnswerFalsified(questionKey, answerKey);
  }

  function resolveSuccess (
    bytes32 answerKey,
    Machine.Image calldata image
  ) override external
  {
    Answer storage answer = answers[answerKey];
    Question storage question = questions[answer.questionKey];

    require(_questionExists(answer.questionKey) && _answerExists(answerKey), "Question and answer must exists.");
    require(now >= question.askTime + question.timeout, "Answering is still in progress.");
    require(Machine.imageHash(image) == answerKey, "Image hash does not match answerKey.");
    require(question.numberOfUnfalsifiedAnswers == 1,"Must be only one answer to resolve success.");

    bytes32 questionKey = answer.questionKey;
    address answerer = answer.answerer;
    function(bytes32, Machine.Image memory) external callback = question.successCallback;

    //_questionCleanup
    delete questions[questionKey].answerKeys[answer.indexInQuestionArray];
    delete answers[answerKey];
    delete questions[questionKey];

    payable(answerer).call{value: STAKE_SIZE}("");

    try callback(questionKey, image) {
      emit QuestionResolvedSuccessfully(questionKey, image);
    } catch {
      emit QuestionResolvedUnsuccessfully(questionKey);
    }
  }

  function resolveFail (
    bytes32 questionKey
  ) override external
  {
    Question storage question = questions[questionKey];

    require(_questionExists(questionKey), "Question must exist.");
    require(now >= question.askTime + (2 * question.timeout), "It is not the time to give up yet.");

    function(bytes32) external callback = question.failCallback;

    _removeQuestion(questionKey);

    try callback(questionKey) {
      emit QuestionResolvedUnsuccessfully(questionKey);
    } catch {
      emit QuestionResolvedUnsuccessfully(questionKey);
    }
  }

  function _questionExists (
    bytes32 questionKey
  ) internal view returns (bool)
  {
    return questions[questionKey].askTime > 0;
  }

  function _answerExists (
    bytes32 answerKey
  ) internal view returns (bool)
  {
    return answers[answerKey].questionKey > 0;
  }

  function _enoughTimeForAnswer (
    bytes32 questionKey
  ) internal view returns (bool)
  {
    Question storage question = questions[questionKey];
    return now < question.askTime + (question.timeout / 3);
  }

  function _removeAnswer (
    bytes32 answerKey
  ) internal
  {
    Answer storage answer = answers[answerKey];
    Question storage question = questions[answer.questionKey];

    if (answer.indexInQuestionArray == question.answerKeys.length - 1) {
      question.answerKeys.pop();
    } else {
      delete question.answerKeys[answer.indexInQuestionArray];
    }
    question.numberOfUnfalsifiedAnswers--;

    delete answers[answerKey];
  }

  function _removeQuestion (
    bytes32 questionKey
  ) internal
  {
    Question storage question = questions[questionKey];

    for (uint i = 0; i < question.answerKeys.length; i ++) {
      if (question.answerKeys[i] > 0) {
        bytes32 answerKey = question.answerKeys[i];
        delete question.answerKeys[i];
        delete answers[answerKey];
      }
    }

    delete questions[questionKey];
  }
}
