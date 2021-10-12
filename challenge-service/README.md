## Challenger

Challenger is a tool to monitor EMO claims and automatically run challenges for incorrect claims.

## Configuration
To create a config, do the following:
```
$ cp config/default.json config/config.json
```
Fill in all the relevant information with your own data.

### Configuration Requirements
Tool makes a lot of requests, make sure provider that you are using has no total requests limit.


## Before run
1. Paste your encrypted private key in format "keystore v3 standard" (file name should be "keystore.json") inside "./keystore/" folder or use "encryption.js" script in this folder to encrypt your private key with password - the file in format "keystore v3 standard" will be created automatically inside necessary directory.
Example how to use script:
```sh
cd ./keystore
PRIV_KEY=0x86bd05de62f4d29a96db6ed004de2ebd0e39940dc0f2f99fdfe38271b9152901 PASSWORD='my password' node encryption.js
```

2. Edit Dockerfile, line 'ENV PASSWORD=' should be filled with password that you've used when you encrypted your private key.

## Installation with Docker

After complete configuration part you are able to build and run your docker images and containers.

### Build and run container
To build and run:
```sh
docker-compose up --build
```
To start containers in the background add `-d` flag to the command above.

To exit process:
```sh
docker-compose down
```
To run again after exit:
```sh
docker-compose up
```

To manipulate redis database from redis-client (e.g., to reset to zero contracts heights):
```sh
docker exec -it redis redis-cli
```

### Reminder
Remember that your ethereum address should have ETH to send transactions and stake for disputes.
