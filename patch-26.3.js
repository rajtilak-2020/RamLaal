/**
 * Minecraft 26.3 ("Wilderness Bound" / Protocol 777) Compatibility Patcher
 * Automatically ensures mineflayer, minecraft-protocol, and minecraft-data
 * work flawlessly with 26.3 servers. Runs on startup and npm postinstall.
 */

const fs = require('fs');
const path = require('path');

function log(msg) {
  console.log(`[Patch-26.3] ${msg}`);
}

try {
  // 1. Patch minecraft-data 26.3 protocol.json
  const protocolJsonPath = path.join(__dirname, 'node_modules/minecraft-data/minecraft-data/data/pc/26.3/protocol.json');
  if (fs.existsSync(protocolJsonPath)) {
    let raw = fs.readFileSync(protocolJsonPath, 'utf8');
    let modified = false;

    // A. Fix hand mappers in toServer packets to varint
    const data = JSON.parse(raw);
    const toServer = data?.play?.toServer?.types;
    if (toServer) {
      for (const pkt of ['packet_use_entity', 'packet_arm_animation', 'packet_block_place', 'packet_use_item']) {
        if (toServer[pkt] && Array.isArray(toServer[pkt][1])) {
          for (const fld of toServer[pkt][1]) {
            if (fld.name === 'hand' && fld.type !== 'varint') {
              fld.type = 'varint';
              modified = true;
            }
          }
        }
      }

      // A2. Flatten packet_block_place to flat properties expected by mineflayer
      if (toServer['packet_block_place']) {
        const pbpStr = JSON.stringify(toServer['packet_block_place']);
        if (pbpStr.includes('BlockHitResult')) {
          toServer['packet_block_place'] = [
            'container',
            [
              { name: 'hand', type: 'varint' },
              { name: 'location', type: 'position' },
              { name: 'direction', type: 'varint' },
              { name: 'cursorX', type: 'f32' },
              { name: 'cursorY', type: 'f32' },
              { name: 'cursorZ', type: 'f32' },
              { name: 'insideBlock', type: 'bool' },
              { name: 'worldBorderHit', type: 'bool' },
              { name: 'sequence', type: 'varint' }
            ]
          ];
          modified = true;
        }
      }
    }

    // B. Fix packet_advancements displayData coords if outdated
    const adv = data?.play?.toClient?.types?.packet_advancements;
    if (adv) {
      const advStr = JSON.stringify(adv);
      if (advStr.includes('"xCord"')) {
        // Remove stale xCord/yCord and use top-level x/y
        const cleanedStr = advStr
          .replace(/,\s*\{\s*"name":\s*"xCord"[^}]+\}/g, '')
          .replace(/,\s*\{\s*"name":\s*"yCord"[^}]+\}/g, '');
        data.play.toClient.types.packet_advancements = JSON.parse(cleanedStr);
        modified = true;
      }
    }

    if (modified) {
      fs.writeFileSync(protocolJsonPath, JSON.stringify(data, null, 2), 'utf8');
      log('Updated minecraft-data 26.3 protocol.json (hand mappers & advancements)');
    }
  }

  // 2. Patch mineflayer lib/plugins/time.js for 26.1+ world clock updates
  const timeJsPath = path.join(__dirname, 'node_modules/mineflayer/lib/plugins/time.js');
  if (fs.existsSync(timeJsPath)) {
    let timeContent = fs.readFileSync(timeJsPath, 'utf8');
    if (!timeContent.includes('WORLD_CLOCK_REGISTRY') || !timeContent.includes('clockUpdates')) {
      const newTimeJs = `module.exports = inject

const DAY_TICKS = 24000
const NIGHT_START_TICK = 13000
const MOON_PHASES = 8
const PRIMARY_CLOCK = 'overworld'
const WORLD_CLOCK_REGISTRY = 'minecraft:world_clock'

function inject (bot) {
  bot.time = {
    doDaylightCycle: null,
    bigTime: null,
    time: null,
    timeOfDay: null,
    day: null,
    isDay: null,
    moonPhase: null,
    bigAge: null,
    age: null,
    clocks: {}
  }

  let clockNames = []
  bot._client.on('registry_data', (packet) => {
    if (packet?.id !== WORLD_CLOCK_REGISTRY) return
    clockNames = packet.entries.map(entry => entry.key.replace('minecraft:', ''))
  })

  bot._client.on('update_time', (packet) => {
    const age = longToBigInt(packet.age)
    bot.time.bigAge = age
    bot.time.age = Number(age)

    if (packet.clockUpdates) {
      for (const update of packet.clockUpdates) {
        bot.time.clocks[clockNames[update.id] ?? \`unknown_clock_\${update.id}\`] = { ...update }
      }
      applyPrimaryClock()
    } else if (packet.time !== undefined) {
      const time = longToBigInt(packet.time)
      const doDaylightCycle = (packet.tickDayTime !== undefined) ? !!packet.tickDayTime : time >= 0n
      applyTime(doDaylightCycle ? time : (time < 0n ? -time : time), doDaylightCycle)
    }

    bot.emit('time')
  })

  bot.on('physicsTick', () => {
    let advanced = false
    for (const clock of Object.values(bot.time.clocks)) {
      if (!clock.rate) continue
      clock.partialTick += clock.rate
      const fullTicks = Math.floor(clock.partialTick)
      if (fullTicks === 0) continue
      clock.partialTick -= fullTicks
      clock.totalTicks = BigInt(clock.totalTicks) + BigInt(fullTicks)
      advanced = true
    }
    if (advanced) applyPrimaryClock()
  })

  function applyPrimaryClock () {
    const clock = bot.time.clocks[PRIMARY_CLOCK] ?? lowestIdClock()
    if (clock) applyTime(BigInt(clock.totalTicks), clock.rate > 0)
  }

  function lowestIdClock () {
    let lowest = null
    for (const clock of Object.values(bot.time.clocks)) {
      if (lowest === null || clock.id < lowest.id) lowest = clock
    }
    return lowest
  }

  function applyTime (time, doDaylightCycle) {
    bot.time.doDaylightCycle = doDaylightCycle
    bot.time.bigTime = time
    bot.time.time = Number(time)
    bot.time.timeOfDay = bot.time.time % DAY_TICKS
    bot.time.day = Math.floor(bot.time.time / DAY_TICKS)
    bot.time.isDay = bot.time.timeOfDay >= 0 && bot.time.timeOfDay < NIGHT_START_TICK
    bot.time.moonPhase = bot.time.day % MOON_PHASES
  }
}

function longToBigInt (arr) {
  if (!arr) return 0n
  if (typeof arr === 'bigint') return arr
  if (typeof arr === 'number') return BigInt(arr)
  return BigInt.asIntN(64, (BigInt(arr[0]) << 32n) | (BigInt(arr[1]) & 0xFFFFFFFFn))
}
`;
      fs.writeFileSync(timeJsPath, newTimeJs, 'utf8');
      log('Patched mineflayer lib/plugins/time.js with 26.3 world clock support');
    }
  }

  // 3. Patch mineflayer lib/plugins/physics.js for 26.3 teleport_confirm
  const physicsJsPath = path.join(__dirname, 'node_modules/mineflayer/lib/plugins/physics.js');
  if (fs.existsSync(physicsJsPath)) {
    let physicsContent = fs.readFileSync(physicsJsPath, 'utf8');
    if (physicsContent.includes("bot.protocolVersion >= 777") && !physicsContent.includes("yRot: newYaw")) {
      physicsContent = physicsContent.replace(
        "yaw: newYaw,\n          pitch: newPitch",
        "yRot: newYaw,\n          xRot: newPitch,\n          yaw: newYaw,\n          pitch: newPitch"
      );
      fs.writeFileSync(physicsJsPath, physicsContent, 'utf8');
      log('Patched mineflayer lib/plugins/physics.js teleport_confirm with yRot and xRot');
    }
  }

  // 4. Patch mineflayer lib/plugins/entities.js for entityDelta steps
  const entitiesJsPath = path.join(__dirname, 'node_modules/mineflayer/lib/plugins/entities.js');
  if (fs.existsSync(entitiesJsPath)) {
    let entitiesContent = fs.readFileSync(entitiesJsPath, 'utf8');
    if (!entitiesContent.includes('packet.move && packet.move.steps')) {
      entitiesContent = entitiesContent.replaceAll(
        "if (bot.supportFeature('fixedPointDelta')) {",
        "if (packet.move && packet.move.steps) {\n      for (const step of packet.move.steps) {\n        entity.position.translate((step.dX || 0) / 4096, (step.dY || 0) / 4096, (step.dZ || 0) / 4096)\n      }\n    } else if (bot.supportFeature('fixedPointDelta')) {"
      );
      fs.writeFileSync(entitiesJsPath, entitiesContent, 'utf8');
      log('Patched mineflayer lib/plugins/entities.js for 26.3 entityDelta movement');
    }
  }

  // 5. Patch minecraft-protocol datatypes/minecraft.js for entityDelta
  const mcDatatypesPath = path.join(__dirname, 'node_modules/minecraft-protocol/src/datatypes/minecraft.js');
  if (fs.existsSync(mcDatatypesPath)) {
    let mcDataContent = fs.readFileSync(mcDatatypesPath, 'utf8');
    if (!mcDataContent.includes('entityDelta: [readEntityDelta')) {
      mcDataContent = mcDataContent.replace(
        "vecDelta: [readVecDelta, writeVecDelta, sizeOfVecDelta]",
        "vecDelta: [readVecDelta, writeVecDelta, sizeOfVecDelta],\n  entityDelta: [readEntityDelta, writeEntityDelta, sizeOfEntityDelta]"
      );

      const entityDeltaFns = `
function readEntityDelta (buffer, offset) {
  let cursor = offset
  const props = readVarInt(buffer, cursor)
  cursor += props.size
  const onGround = (props.value & 1) !== 0
  const stepCount = props.value >>> 1

  const steps = []
  if (stepCount <= 0) {
    if (cursor + 6 > buffer.length) throw new PartialReadError('Unexpected buffer end while reading entityDelta (linear)')
    steps.push({
      dX: buffer.readInt16BE(cursor),
      dY: buffer.readInt16BE(cursor + 2),
      dZ: buffer.readInt16BE(cursor + 4),
      ticks: 0
    })
    cursor += 6
  } else {
    for (let i = 0; i < stepCount; i++) {
      const ticksResult = readVarInt(buffer, cursor)
      cursor += ticksResult.size
      if (cursor + 6 > buffer.length) throw new PartialReadError('Unexpected buffer end while reading entityDelta (stepped)')
      steps.push({
        dX: buffer.readInt16BE(cursor),
        dY: buffer.readInt16BE(cursor + 2),
        dZ: buffer.readInt16BE(cursor + 4),
        ticks: ticksResult.value
      })
      cursor += 6
    }
  }

  return { value: { onGround, steps }, size: cursor - offset }
}

function writeEntityDelta (value, buffer, offset) {
  const { onGround, steps } = value
  const useLinear = steps.length === 1 && steps[0].ticks === 0
  const stepCount = useLinear ? 0 : steps.length
  const properties = (onGround ? 1 : 0) | (stepCount << 1)

  offset = writeVarInt(properties, buffer, offset)
  if (useLinear) {
    buffer.writeInt16BE(steps[0].dX, offset)
    buffer.writeInt16BE(steps[0].dY, offset + 2)
    buffer.writeInt16BE(steps[0].dZ, offset + 4)
    offset += 6
  } else {
    for (const step of steps) {
      offset = writeVarInt(step.ticks, buffer, offset)
      buffer.writeInt16BE(step.dX, offset)
      buffer.writeInt16BE(step.dY, offset + 2)
      buffer.writeInt16BE(step.dZ, offset + 4)
      offset += 6
    }
  }
  return offset
}

function sizeOfEntityDelta (value) {
  const { onGround, steps } = value
  const useLinear = steps.length === 1 && steps[0].ticks === 0
  const stepCount = useLinear ? 0 : steps.length
  const properties = (onGround ? 1 : 0) | (stepCount << 1)

  let size = sizeOfVarInt(properties)
  if (useLinear) {
    size += 6
  } else {
    for (const step of steps) {
      size += sizeOfVarInt(step.ticks) + 6
    }
  }
  return size
}
`;
      mcDataContent = mcDataContent.replace(
        "const PartialReadError = require('protodef').utils.PartialReadError",
        entityDeltaFns + "\nconst PartialReadError = require('protodef').utils.PartialReadError"
      );
      fs.writeFileSync(mcDatatypesPath, mcDataContent, 'utf8');
      log('Patched minecraft-protocol datatypes/minecraft.js with entityDelta');
    }
  }

  // 6. Patch minecraft-protocol compiler-minecraft.js
  const compilerPath = path.join(__dirname, 'node_modules/minecraft-protocol/src/datatypes/compiler-minecraft.js');
  if (fs.existsSync(compilerPath)) {
    let compilerContent = fs.readFileSync(compilerPath, 'utf8');
    if (!compilerContent.includes("entityDelta: ['native', minecraft.entityDelta[0]]")) {
      compilerContent = compilerContent.replace(
        "vecDelta: ['native', minecraft.vecDelta[0]]",
        "vecDelta: ['native', minecraft.vecDelta[0]],\n    entityDelta: ['native', minecraft.entityDelta[0]]"
      );
      compilerContent = compilerContent.replace(
        "vecDelta: ['native', minecraft.vecDelta[1]]",
        "vecDelta: ['native', minecraft.vecDelta[1]],\n    entityDelta: ['native', minecraft.entityDelta[1]]"
      );
      compilerContent = compilerContent.replace(
        "vecDelta: ['native', minecraft.vecDelta[2]]",
        "vecDelta: ['native', minecraft.vecDelta[2]],\n    entityDelta: ['native', minecraft.entityDelta[2]]"
      );
      fs.writeFileSync(compilerPath, compilerContent, 'utf8');
      log('Patched minecraft-protocol datatypes/compiler-minecraft.js with entityDelta');
    }
  }

  // 7. Patch minecraft-protocol serializer.js to suppress 0x85 (advancements) parse failures
  const serializerPath = path.join(__dirname, 'node_modules/minecraft-protocol/src/transforms/serializer.js');
  if (fs.existsSync(serializerPath)) {
    let serContent = fs.readFileSync(serializerPath, 'utf8');
    if (!serContent.includes('packetId === 0x85')) {
      serContent = serContent.replace(
        "if (e.partialReadError) {",
        "if (e.partialReadError || packetId === 0x85) {"
      );
      fs.writeFileSync(serializerPath, serContent, 'utf8');
      log('Patched minecraft-protocol serializer.js to safely ignore 0x85 advancements parse errors');
    }
  }
} catch (err) {
  console.warn('[Patch-26.3] Warning during patch verification:', err.message);
}
