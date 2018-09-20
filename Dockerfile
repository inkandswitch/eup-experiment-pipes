FROM mhart/alpine-node:10

WORKDIR /usr/src

COPY package.json yarn.lock ./
RUN yarn install
COPY . .

RUN GENERATE_SOURCEMAP=false yarn build
RUN mv ./build /public
