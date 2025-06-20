const roomId = '{{ roomId }}'
    const playerName = '{{ playerName }}'
    const socket = io('http://192.168.1.183:3333')
    let isCreator = false

    let isDrawing = false
    let canDraw = false
    let currentWord = ''
    let roundDuration = 60
    let timerInterval = null

    // Join room
    socket.emit('join-room', { roomId, playerName })

    // Elements
    const playersList = document.getElementById('playersList')
    const wordDisplay = document.getElementById('wordDisplay')
    const startGameBtn = document.getElementById('startGameBtn')
    const gameStatus = document.getElementById('gameStatus')
    const roundInfo = document.getElementById('roundInfo')
    const timer = document.getElementById('timer')
    const timerContainer = document.getElementById('timerContainer')
    const chatMessages = document.getElementById('chatMessages')
    const chatForm = document.getElementById('chatForm')
    const chatInput = document.getElementById('chatInput')
    const tools = document.getElementById('tools')
    const clearBtn = document.getElementById('clearBtn')
    const penBtn = document.getElementById('penBtn')
    const eraserBtn = document.getElementById('eraserBtn')
    const colorBtns = document.querySelectorAll('.color-btn')
    const canvas = document.getElementById('drawingCanvas')
    const ctx = canvas.getContext('2d')

    // Resize canvas
    function resizeCanvas() {
        // Sauvegarder le dessin actuel
        const dataUrl = canvas.toDataURL();

        // Limiter la taille maximale
        const rect = canvas.parentElement.getBoundingClientRect();
        const maxWidth = 900;
        const maxHeight = 600;
        const width = Math.min(rect.width, maxWidth);
        const height = Math.min(rect.height, maxHeight);

        canvas.width = width;
        canvas.height = height;

        // Restaurer le dessin
        const img = new window.Image();
        img.onload = function () {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, width, height);
        };
        img.src = dataUrl;
    }
    window.addEventListener('resize', resizeCanvas)
    resizeCanvas()

    let penColor = '#000'
    let penWidth = 3
    let erasing = false

    let drawing = false
    let lastX = 0, lastY = 0

    function startDraw(e) {
        if (!canDraw) return;
        drawing = true;
        [lastX, lastY] = getPos(e);
    }

    function draw(e) {
      if (!drawing || !canDraw) return;
      const [x, y] = getPos(e);
      ctx.strokeStyle = erasing ? '#fff' : penColor;
      ctx.lineWidth = penWidth; // Utilisé pour stylo ET gomme
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(lastX, lastY);
      ctx.lineTo(x, y);
      ctx.stroke();
      socket.emit('drawing', { roomId, drawingData: { x, y, lastX, lastY, color: ctx.strokeStyle, width: ctx.lineWidth } });
      [lastX, lastY] = [x, y];
    }

    function getPos(e) {
        const rect = canvas.getBoundingClientRect();
        let clientX, clientY;
        if (e.touches && e.touches.length > 0) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else {
            clientX = e.clientX;
            clientY = e.clientY;
        }
        const x = (clientX - rect.left) * (canvas.width / rect.width);
        const y = (clientY - rect.top) * (canvas.height / rect.height);
        return [x, y];
    }

    function endDraw() {
        drawing = false
    }

    // Événements souris/tactile
    canvas.addEventListener('mousedown', startDraw)
    canvas.addEventListener('mousemove', draw)
    canvas.addEventListener('mouseup', endDraw)
    canvas.addEventListener('mouseleave', endDraw)
    canvas.addEventListener('touchstart', startDraw)
    canvas.addEventListener('touchmove', draw)
    canvas.addEventListener('touchend', endDraw)

    // Receive drawing
    socket.on('drawing', data => {
        ctx.strokeStyle = data.color
        ctx.lineWidth = data.width
        ctx.lineCap = 'round'
        ctx.beginPath()
        ctx.moveTo(data.lastX, data.lastY)
        ctx.lineTo(data.x, data.y)
        ctx.stroke()
    })

    clearBtn.onclick = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        socket.emit('clear-canvas', roomId)
    }
    socket.on('clear-canvas', () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height)
    })
    canvas.style.cursor = 'crosshair'

    penBtn.onclick = () => {
        erasing = false
        penBtn.classList.add('active')
        eraserBtn.classList.remove('active')
        canvas.style.cursor = 'crosshair'
    }
    const penWidthInput = document.getElementById('penWidth');
    const penWidthValue = document.getElementById('penWidthValue');

    penWidthInput.oninput = () => {
      penWidth = parseInt(penWidthInput.value, 10);
      penWidthValue.textContent = penWidth;
    };

    eraserBtn.onclick = () => {
        erasing = true
        eraserBtn.classList.add('active')
        penBtn.classList.remove('active')
        canvas.style.cursor = 'cell'
    }
    colorBtns.forEach(btn => {
        btn.onclick = () => {
            penColor = btn.dataset.color
            colorBtns.forEach(b => b.classList.remove('selected'))
            btn.classList.add('selected')
        }
    })
    penBtn.classList.add('active')
    colorBtns[0].classList.add('selected')

    // Players list
    socket.on('players-updated', players => {
        playersList.innerHTML = ''
        let foundCreator = false
        players.forEach(p => {
            const li = document.createElement('li')
            li.className = 'player-item'
            if (p.isDrawing) li.classList.add('player-drawer')
            li.innerHTML = `
                <div>${p.name} ${p.isDrawing ? '✏️' : ''} ${p.isCreator ? '👑' : ''}</div>
                <div class="score">${p.score} pts</div>
            `
            playersList.appendChild(li)

            if (p.isCreator && p.id === socket.id) {
                foundCreator = true
            }
        })
        isCreator = foundCreator
        startGameBtn.style.display = isCreator ? '' : 'none'
    })

    socket.on('room-info', info => {
        gameStatus.textContent = info.gameStarted ? 'En cours' : 'En attente...'
        roundInfo.textContent = info.gameStarted ? `Manche ${info.round} / ${info.maxRounds}` : ''
        if (info.gameStarted) startGameBtn.style.display = 'none'
        else if (isCreator) startGameBtn.style.display = ''
    })

    startGameBtn.onclick = () => {
        socket.emit('start-game', roomId)
        startGameBtn.classList.remove('animate__pulse', 'animate__infinite')
    }

    socket.on('round-start', data => {
        stopTimer()
        gameStatus.textContent = 'En cours'
        roundInfo.textContent = `Manche ${data.round}`
        roundDuration = data.duration || 60
        if (data.isDrawing) {
            canDraw = true
            tools.style.display = 'flex'
            wordDisplay.textContent = data.word
        } else {
            canDraw = false
            tools.style.display = 'none'
            wordDisplay.textContent = '_ '.repeat(data.word.length)
        }
        startTimer()
    })

    socket.on('round-end', data => {
        stopTimer()
        wordDisplay.textContent = `Mot : ${data.word}`
        canDraw = false
        tools.style.display = 'none'
        const blur = document.getElementById('canvasBlur')
        let scores = `
            <div class="animate__animated animate__zoomIn">
                <h2 class="text-xl font-bold mb-4">Manche terminée</h2>
                <p class="text-lg mb-4">Mot : <b>${data.word}</b></p>
                <div class="mt-4">
                    <h3 class="font-bold mb-2">Scores de la manche</h3>
                    <div class="flex flex-col gap-2">
        `
        data.scores.forEach(s => {
            scores += `<div class="flex justify-between"><span>${s.name}</span><span class="font-bold">${s.score} pts</span></div>`
        })
        scores += `
                    </div>
                </div>
            </div>
        `
        blur.innerHTML = scores
        blur.style.display = 'flex'
        setTimeout(() => {
            blur.style.display = 'none'
        }, 5000)
    })

    socket.on('game-end', data => {
        stopTimer()
        const blur = document.getElementById('canvasBlur')
        let message = `
            <div class="animate__animated animate__zoomIn">
                <h2 class="text-2xl font-bold mb-4">Fin de la partie !</h2>
                <div class="mb-6 p-3 bg-gradient-to-r from-indigo-100 to-pink-100 rounded-lg">
                    <p class="font-medium">Gagnant : <b>${data.winner.name}</b></p>
                    <p class="text-xl font-bold text-pink-600">${data.winner.score} pts</p>
                </div>
                <div class="mt-4">
                    <h3 class="font-bold mb-2">Scores finaux</h3>
                    <div class="flex flex-col gap-2">
        `
        data.scores.forEach((s, i) => {
            message += `<div class="flex justify-between items-center ${i === 0 ? 'text-pink-600 font-bold' : ''}">
                <span>${i + 1}. ${s.name}</span>
                <span>${s.score} pts</span>
            </div>`
        })
        message += `
                    </div>
                </div>
            </div>
        `
        blur.innerHTML = message
        blur.style.display = 'flex'

        wordDisplay.textContent = 'En attente du jeu...'
        gameStatus.textContent = 'En attente...'
        if (isCreator) {
            startGameBtn.style.display = ''
            startGameBtn.classList.add('animate__pulse', 'animate__infinite')
        }
    })

    socket.on('correct-guess', data => {
        addChatMessage(`${data.playerName} a trouvé le mot ! (+${data.points} pts)`, 'system')
    })

    chatForm.onsubmit = e => {
        e.preventDefault()
        const msg = chatInput.value.trim()
        if (!msg) return
        if (!canDraw) {
            socket.emit('guess', { roomId, guess: msg })
        } else {
            socket.emit('chat-message', { roomId, message: msg })
        }
        chatInput.value = ''
    }

    socket.on('chat-message', data => {
        addChatMessage(`${data.playerName} : ${data.message}`, data.isGuess ? 'guess' : 'normal')
    })

    function addChatMessage(msg, type) {
        const div = document.createElement('div')
        div.textContent = msg
        div.className = 'message'

        if (type === 'system') {
            div.classList.add('system')
        } else if (type === 'guess') {
            div.style.fontStyle = 'italic'
        }

        chatMessages.appendChild(div)
        chatMessages.scrollTop = chatMessages.scrollHeight
    }

    // Timer
    function startTimer() {
        stopTimer();
        let t = roundDuration;
        timer.textContent = `${t}s`;
        timerContainer.style.display = 'flex';
        timerInterval = setInterval(() => {
            t--;
            timer.textContent = `${t}s`;
            if (t <= 10) {
                timer.classList.add('animate__animated', 'animate__heartBeat');
                timer.style.color = '#e74c3c';
            }
            if (t <= 0) {
                stopTimer();
            }
        }, 1000);
    }

    function stopTimer() {
        if (timerInterval) {
            clearInterval(timerInterval)
        }
        timer.textContent = ''
        timer.classList.remove('animate__animated', 'animate__heartBeat');
        timer.style.color = '';
        timerContainer.style.display = 'none';
    }