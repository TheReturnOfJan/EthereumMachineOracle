#!/bin/bash
machinePath=$1
result=$(node basic_checker.js $machinePath)
echo "$result"
if [[ $result = "Your file passed basic checker." ]]
 then
   echo "Echidna starts fuzzing, please wait."
   cd ./echidna
   echidna_res=$(echidna-test Test.sol --contract Test --config config.yaml)
   echo "The fuzzing finished."
   analized=$(node ../analyzer.js $echidna_res)
   echo "$analized"
fi
