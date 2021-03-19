// @ts-check
import availablePinningServicesList from '../constants/pinning'

const parseService = (service, availablePinningServices) => {
  const icon = availablePinningServices.find(x => x.name.toLowerCase() === service.service.toLowerCase())?.icon
  const parsedService = { ...service, name: service.service, icon }

  if (service?.stat?.status === 'invalid') {
    console.error(`Invalid stats found for service ${service.service}`)

    return { ...parsedService, numberOfPins: 'Error' }
  }

  return { ...parsedService, numberOfPins: service.stat?.pinCount?.pinned }
}

/**
 * TODO: This might change, current version from: https://github.com/ipfs/go-ipfs/blob/petar/pincli/core/commands/remotepin.go#L53
 * @typedef {Object} RemotePin
 * @property {string} id
 * @property {string} name
 * @property {('queued'|'pinning'|'pinned'|'failed')} status
 * @property {string} cid
 * @property {Array<string>} [delegates] e.g. ["/dnsaddr/pin-service.example.com"]
*/
const pinningBundle = {
  name: 'pinning',
  reducer: (state = {
    remotePins: [],
    arePinningServicesAvailable: false
  }, action) => {
    if (action.type === 'SET_REMOTE_PINS') {
      return { ...state, remotePins: action.payload }
    }
    if (action.type === 'SET_REMOTE_PINNING_SERVICES') {
      return { ...state, pinningServices: action.payload }
    }
    if (action.type === 'SET_REMOTE_PINNING_SERVICES_AVAILABLE') {
      return { ...state, arePinningServicesAvailable: action.payload }
    }
    return state
  },

  doFetchRemotePins: () => async ({ dispatch, store }) => {
    // const pinningServices = store.selectPinningServices()

    // if (!pinningServices?.length) return

    // // TODO: unmock this (e.g. const pins = ipfs.pin.remote.ls ...)
    // const response = [
    //   {
    //     id: 'Pinata:UniqueIdOfPinRequest',
    //     status: 'queued',
    //     cid: 'QmQsUbcVx6Vu8vtL858FdxD3sVBE6m8uP3bjFoTzrGubmX',
    //     name: '26_remote.png',
    //     delegates: ['/dnsaddr/pin-service.example.com']
    //   }
    // ]

    // // TODO: get type of item?

    // const remotePins = response.map(item => ({
    //   ...item,
    //   isRemotePin: true,
    //   type: item.type || 'unknown',
    //   size: Math.random() * 1000// TODO: files.stat in the future
    // }))

    // // TODO: handle different status (queued = async fetch in batches to update ui?)

    const remotePins = []

    dispatch({ type: 'SET_REMOTE_PINS', payload: remotePins })
  },

  selectRemotePins: (state) => state.pinning.remotePins || [],

  doSelectRemotePinsForFile: (file) => async ({ store }) => {
    const pinningServicesNames = store.selectPinningServices().map(remote => remote.name)
    const remotePinForFile = store.selectRemotePins().filter(pin => pin.cid === file.cid.string)
    const servicesBeingUsed = remotePinForFile.map(pin => pin.id.split(':')[0]).filter(pinId => pinningServicesNames.includes(pinId))

    return servicesBeingUsed
  },

  doFetchPinningServices: () => async ({ getIpfs, store, dispatch }) => {
    const ipfs = getIpfs()
    if (!ipfs || store?.ipfs?.ipfs?.ready || !ipfs.pin.remote) return null

    const isRemotePinningSupported = (await ipfs.commands()).Subcommands.find(c => c.Name === 'pin').Subcommands.some(c => c.Name === 'remote')

    if (!isRemotePinningSupported) return null

    dispatch({ type: 'SET_REMOTE_PINNING_SERVICES_AVAILABLE', payload: true })

    const availablePinningServices = store.selectAvailablePinningServices()
    const firstListOfServices = await ipfs.pin.remote.service.ls()
    const remoteServices = firstListOfServices.map(service => parseService(service, availablePinningServices))
    dispatch({ type: 'SET_REMOTE_PINNING_SERVICES', payload: remoteServices })

    const fullListOfServices = await ipfs.pin.remote.service.ls({ stat: true })
    const fullRemoteServices = fullListOfServices.map(service => parseService(service, availablePinningServices))
    dispatch({ type: 'SET_REMOTE_PINNING_SERVICES', payload: fullRemoteServices })
  },

  selectPinningServices: (state) => state.pinning.pinningServices || [],

  selectAvailablePinningServices: () => availablePinningServicesList,

  selectArePinningServicesAvailable: (state) => state.pinning.arePinningServicesAvailable,

  selectPinningServicesDefaults: () => availablePinningServicesList.reduce((prev, curr) => ({
    ...prev,
    [curr.name]: {
      ...curr,
      nickname: curr.name
    }
  }), {}),

  doSetPinning: (cid, services = []) => async ({ getIpfs, store }) => {
    const ipfs = getIpfs()

    const pinLocally = services.includes('local')
    try {
      pinLocally ? await ipfs.pin.add(cid) : await ipfs.pin.rm(cid)
    } catch (e) {
      console.error(e)
    } finally {
      await store.doPinsFetch()
    }

    // TODO: handle rest of services
  },
  doAddPinningService: ({ apiEndpoint, nickname, secretApiKey }) => async ({ getIpfs }) => {
    const ipfs = getIpfs()

    await ipfs.pin.remote.service.add(nickname, {
      endpoint: apiEndpoint,
      key: secretApiKey
    })
  },

  doRemovePinningService: (name) => async ({ getIpfs, store }) => {
    const ipfs = getIpfs()

    await ipfs.pin.remote.service.rm(name)

    store.doFetchPinningServices()
  }
}
export default pinningBundle
