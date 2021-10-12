## How to run Machine approver?
Firstly, pull the image from Docker Hub:
```sh
docker pull roleengineer/machine_approver:latest
```
After that go to the directory where the file with Machine implementation with generate function is, also all the dependencies, if exists, must be in this directory too. From this directory run the following command:
```sh
docker run -v `pwd`:/src roleengineer/machine_approver /src/YOUR_FILE_NAME.sol
```
