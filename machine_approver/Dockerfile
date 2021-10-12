FROM docker.pkg.github.com/crytic/echidna/echidna:latest

# Install Node.js
RUN apt-get install --yes curl
RUN curl --silent --location https://deb.nodesource.com/setup_10.x | bash
RUN apt-get install --yes nodejs
RUN apt-get install --yes build-essential

ARG MA_DIR=/home/machine_approver
RUN mkdir -p ${MA_DIR}
WORKDIR ${MA_DIR}

COPY package*.json ./
RUN npm install

COPY . .

RUN cd ${MA_DIR} && chmod +x run.sh
ENTRYPOINT ["./run.sh"]
