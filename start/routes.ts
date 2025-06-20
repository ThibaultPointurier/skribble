import router from '@adonisjs/core/services/router'

router.get('/', async ({ view }) => {
  return view.render('home')
})

router.post('/create-room', async ({ request, response, session }) => {
  const { playerName } = request.only(['playerName'])

  if (!playerName) {
    return response.redirect().back()
  }

  const roomId = Math.random().toString(36).substring(2, 8).toUpperCase()

  // Sauvegarder le nom du joueur en session
  session.put('playerName', playerName)

  return response.redirect(`/room/${roomId}`)
})

router.post('/join-room', async ({ request, response, session }) => {
  const { roomId, playerName } = request.only(['roomId', 'playerName'])

  if (!roomId || !playerName) {
    return response.redirect().back()
  }

  // Sauvegarder le nom du joueur en session
  session.put('playerName', playerName)

  return response.redirect(`/room/${roomId.toUpperCase()}`)
})

// Page de la room
router.get('/room/:id', async ({ params, view, session }) => {
  const playerName = session.get('playerName')

  if (!playerName) {
    return view.render('home')
  }

  return view.render('room', {
    roomId: params.id,
    playerName: playerName
  })
})
