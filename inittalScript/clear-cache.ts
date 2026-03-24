import { createClient } from 'redis'

const client = createClient({
  username: 'default',
  password: 'mzhZWXojb8f47R0SpTP1tba0beFwEuVN',
  socket: {
    host: 'redis-13584.c292.ap-southeast-1-1.ec2.cloud.redislabs.com',
    port: 13584,
  },
})

client.on('error', (err) => console.log('Redis Client Error', err))

async function run() {
  await client.connect()
  console.log('Connected to Redis')

  const keys = await client.keys('*roleId:3*') // Match any key containing roleId:3 (handling potential namespaces)
  console.log('Found keys:', keys)

  if (keys.length > 0) {
    await client.del(keys)
    console.log('Deleted keys')
  } else {
    console.log('No keys found')
  }

  await client.disconnect()
}

run()
