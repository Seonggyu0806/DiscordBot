const { Client, Events, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
require('dotenv').config();

// 클라이언트 인스턴스 생성 (필요한 인텐트 설정)
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// 진행 중인 배그 모집 세션을 저장할 스토리지 (메모리 변수)
const sessions = new Map();

// 봇이 준비되었을 때 한 번 실행되는 이벤트
client.once(Events.ClientReady, readyClient => {
    console.log(`✅ 준비 완료! 로그인된 봇: ${readyClient.user.tag}`);
});

// 메시지를 받을 때마다 실행되는 이벤트
client.on(Events.MessageCreate, async message => {
    // 봇 자신이 보낸 메시지라면 무시
    if (message.author.bot) return;

    // '!배그모집' 명령어가 입력됐을 때 반응
    if (message.content.startsWith('!배그모집')) {

        // 버튼 4개 생성 (참가, 취소, 바로시작, 모집취소)
        const joinButton = new ButtonBuilder()
            .setCustomId('join_pubg')
            .setLabel('🚀 참가하기')
            .setStyle(ButtonStyle.Primary);

        const leaveButton = new ButtonBuilder()
            .setCustomId('leave_pubg')
            .setLabel('❌ 내리기')
            .setStyle(ButtonStyle.Secondary);

        const startEarlyButton = new ButtonBuilder()
            .setCustomId('start_early')
            .setLabel('🔥 지금 출발')
            .setStyle(ButtonStyle.Success);

        const cancelButton = new ButtonBuilder()
            .setCustomId('cancel_pubg')
            .setLabel('💣 모집 취소')
            .setStyle(ButtonStyle.Danger);

        // 버튼들을 한 줄(Row)에 묶기
        const row = new ActionRowBuilder().addComponents(joinButton, leaveButton, startEarlyButton, cancelButton);

        // 보기 좋은 임베드 메시지(박스 모양 메시지) 생성
        const embed = new EmbedBuilder()
            .setColor(0xF1A20A) // 배그스러운 주황색 계열
            .setTitle('🍗 배틀그라운드 스쿼드 모집!')
            .setDescription(`**모집장:** <@${message.author.id}>\n\n**현재 참가자 (1/4):**\n1. <@${message.author.id}>\n2. [비어있음]\n3. [비어있음]\n4. [비어있음]\n\n\`참가하기\` 버튼을 눌러 스쿼드에 합류하세요!`)
            .setTimestamp();

        // 사용자에게 메시지 전송 및 결과 객체 저장
        const reply = await message.reply({ embeds: [embed], components: [row] });

        // 전송한 메시지의 ID를 키로 하여 모집 상태(참가자 목록) 저장
        sessions.set(reply.id, {
            authorId: message.author.id,
            participants: [message.author.id],
            maxPlayers: 4
        });
    }
});

// 버튼을 클릭했을 때 발생하는 이벤트 (Interaction)
client.on(Events.InteractionCreate, async interaction => {
    // 버튼 클릭 이벤트가 아니라면 종료
    if (!interaction.isButton()) return;

    // 클릭한 버튼의 메시지 아이디로 세션 찾기
    const messageId = interaction.message.id;
    const session = sessions.get(messageId);

    // 저장된 세션이 없다면 (봇이 재시작됐거나 모집 완료 등)
    if (!session) {
        return interaction.reply({ content: '이 모집은 이미 종료되었거나 유효하지 않습니다.', ephemeral: true });
    }

    if (interaction.customId === 'join_pubg') {
        // 이미 참가한 사람인지 체크
        if (session.participants.includes(interaction.user.id)) {
            return interaction.reply({ content: '이미 참가 중입니다.', ephemeral: true });
        }

        // 인원이 꽉 찼는지 체크
        if (session.participants.length >= session.maxPlayers) {
            return interaction.reply({ content: '이미 스쿼드가 꽉 찼습니다!', ephemeral: true });
        }

        // 참가자 목록에 추가
        session.participants.push(interaction.user.id);

    } else if (interaction.customId === 'leave_pubg') {
        // 참가하지 않은 경우
        if (!session.participants.includes(interaction.user.id)) {
            return interaction.reply({ content: '참가 상태가 아닙니다.', ephemeral: true });
        }

        // 모집장 본인은 취소 불가 처리
        if (session.authorId === interaction.user.id) {
            return interaction.reply({ content: '모집장은 내릴 수 없습니다. 취소하려면 `모집 취소`를 눌러주세요.', ephemeral: true });
        }

        // 참가자 목록에서 제외
        session.participants = session.participants.filter(id => id !== interaction.user.id);

    } else if (interaction.customId === 'cancel_pubg') {
        // 모집장만 취소 가능
        if (session.authorId !== interaction.user.id) {
            return interaction.reply({ content: '모집장만 모집을 취소할 수 있습니다.', ephemeral: true });
        }

        const embed = EmbedBuilder.from(interaction.message.embeds[0])
            .setDescription(`**모집장:** <@${session.authorId}>\n\n❌ **모집이 취소되었습니다.**`)
            .setColor(0xED4245); // 빨간색

        // 버튼 비활성화
        let components = interaction.message.components;
        const disabledRow = new ActionRowBuilder().addComponents(
            components[0].components.map(c => ButtonBuilder.from(c).setDisabled(true))
        );

        sessions.delete(messageId);
        return interaction.update({ embeds: [embed], components: [disabledRow] });

    } else if (interaction.customId === 'start_early') {
        // 모집장만 시작 가능
        if (session.authorId !== interaction.user.id) {
            return interaction.reply({ content: '모집장만 바로 출발할 수 있습니다.', ephemeral: true });
        }

        // 혼자일 때 시작 방지 (옵션)
        if (session.participants.length < 2) {
            return interaction.reply({ content: '최소 2명 이상 모여야 출발할 수 있습니다.', ephemeral: true });
        }

        const mentions = session.participants.map(id => `<@${id}>`).join(' ');

        const embed = EmbedBuilder.from(interaction.message.embeds[0])
            .setDescription(`**모집장:** <@${session.authorId}>\n\n🔥 **조기 출발합니다! (${session.participants.length}인)**\n참여 멤버: ${mentions}`)
            .setColor(0x57F287); // 초록색

        // 버튼 비활성화
        let components = interaction.message.components;
        const disabledRow = new ActionRowBuilder().addComponents(
            components[0].components.map(c => ButtonBuilder.from(c).setDisabled(true))
        );

        sessions.delete(messageId);
        await interaction.update({ embeds: [embed], components: [disabledRow] });
        return interaction.channel.send(`🍗 **스쿼드가 조기 출발합니다!** 치킨 먹으러 가볼까요?\n${mentions}`);
    }

    // 변경된 참가자 정보를 기반으로 임베드 설명 재구성
    const embed = EmbedBuilder.from(interaction.message.embeds[0]);

    let description = `**모집장:** <@${session.authorId}>\n\n**현재 참가자 (${session.participants.length}/${session.maxPlayers}):**\n`;
    for (let i = 0; i < session.maxPlayers; i++) {
        if (session.participants[i]) {
            description += `${i + 1}. <@${session.participants[i]}>\n`;
        } else {
            description += `${i + 1}. [비어있음]\n`;
        }
    }

    // 인원수에 맞게 안내 메시지 변경
    if (session.participants.length < session.maxPlayers) {
        description += `\n\`참가하기\` 버튼을 눌러 스쿼드에 합류하세요!`;
    } else {
        description += `\n🎉 **스쿼드 모집 완료!** 🎉\n모든 인원이 모였습니다!`;
    }

    embed.setDescription(description);

    let components = interaction.message.components;

    // 4명이 꽉 찼다면 버튼 비활성화 (끝난 모집)
    if (session.participants.length >= session.maxPlayers) {
        const disabledRow = new ActionRowBuilder().addComponents(
            components[0].components.map(c => ButtonBuilder.from(c).setDisabled(true))
        );
        components = [disabledRow];
    }

    // 클릭한 버튼 메시지에 대한 로딩 상태를 '수정됨'으로 응답 처리 (오류 방지)
    await interaction.update({ embeds: [embed], components: components });

    // 4명이 모였을 때 전체를 멘션하여 알림 메시지를 방에 보냄
    if (session.participants.length >= session.maxPlayers) {
        // 사람들한테 핑을 위해 멘션 생성
        const mentions = session.participants.map(id => `<@${id}>`).join(' ');
        await interaction.channel.send(`🍗 **스쿼드가 완성되었습니다!** 치킨 먹으러 가볼까요?\n${mentions}`);

        // 완료된 모집은 목록에서 제거
        sessions.delete(messageId);
    }
});

// 환경변수에 저장된 디스코드 봇 토큰으로 로그인
client.login(process.env.DISCORD_TOKEN);
