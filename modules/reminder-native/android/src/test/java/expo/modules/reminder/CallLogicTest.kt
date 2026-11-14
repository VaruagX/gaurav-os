package expo.modules.reminder

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class CallLogicTest {
  private fun cmd(s: String) = CallCommandParser.parse(s)

  @Test fun answerCommands() {
    for (s in listOf("Haan, uthao", "haan", "uthao", "ha uthao", "yes", "Yes please answer", "ok", "हाँ उठाओ", "हां", "उठाओ", "haan ji", "pick up", "uthao na", "Yes", "yeah answer it", "okay", "yaa", "yess", "yea"))
      assertEquals(s, CallCommand.ANSWER, cmd(s))
  }

  @Test fun rejectCommands() {
    for (s in listOf("Nahi", "nahin", "nahi uthao", "mat uthao", "no", "reject", "cut kar do", "नहीं", "मत उठाओ", "kaato", "don't answer", "decline", "No", "nope", "no don't pick up", "nah", "naah"))
      assertEquals(s, CallCommand.REJECT, cmd(s))
  }

  @Test fun noiseAndAmbiguityAreIgnored() {
    for (s in listOf("", "   ", "kya hua", "hello hello", "kal milte hain", "haan nahi", "yes no"))
      assertEquals(s, CallCommand.NONE, cmd(s))
  }

  @Test fun usesFirstClearAlternative() {
    assertEquals(CallCommand.ANSWER, CallCommandParser.parseAny(listOf("hmm", "haan uthao", "nahi")))
    assertEquals(CallCommand.NONE, CallCommandParser.parseAny(listOf("hmm", "blah")))
  }

  @Test fun announcementText() {
    assertEquals("Gaurav, Rahul ka call aaya hai. Kya aap call uthana chahte ho?", CallAnnouncement.text("hinglish-hi", "Gaurav", "Rahul"))
    assertEquals("Gaurav, ek anjaan number ka call aaya hai. Kya aap call uthana chahte ho?", CallAnnouncement.text("hinglish-hi", "Gaurav", null))
    assertEquals("Gaurav, Mom is calling. Do you want to answer?", CallAnnouncement.text("english", "Gaurav", " Mom "))
    assertEquals("both", CallAnnouncement.lang("bogus").id) // unknown language falls back
    assertEquals("Gaurav, Rahul ka call aaya hai. Kya aap call uthana chahte ho? Say yes or no.",
      CallAnnouncement.text("both", "Gaurav", "Rahul"))
  }

  @Test fun flowAnswer() {
    val f = CallFlow()
    assertEquals(CallFlow.Action.StartListening, f.onAnnounced(true))
    assertEquals(CallFlow.Action.StartListening, f.onHeard(listOf("umm"))) // unrecognised: keep listening
    assertEquals(CallFlow.Action.Answer, f.onHeard(listOf("haan uthao")))
    assertEquals(CallFlow.Phase.DONE, f.phase)
    assertEquals(CallFlow.Action.None, f.onHeard(listOf("nahi"))) // nothing after completion
  }

  @Test fun flowRejectAndTimeoutLeavesCallRinging() {
    val r = CallFlow(); r.onAnnounced(true)
    assertEquals(CallFlow.Action.Reject, r.onHeard(listOf("nahi")))

    val t = CallFlow(); t.onAnnounced(true)
    assertEquals(CallFlow.Action.StartListening, t.onListenEnded(5000))
    assertEquals(CallFlow.Action.Finish("no_response"), t.onListenEnded(500)) // no time left: stop, never answer/reject
    assertEquals(CallFlow.Action.None, t.onTimeout())

    val t2 = CallFlow(); t2.onAnnounced(true)
    assertEquals(CallFlow.Action.Finish("no_response"), t2.onTimeout())
  }

  @Test fun flowCallStateChanges() {
    val f = CallFlow(); f.onAnnounced(true)
    assertEquals(CallFlow.Action.None, f.onCallState("RINGING"))
    assertEquals(CallFlow.Action.Finish("call_ended"), f.onCallState("IDLE")) // caller hung up
    assertEquals(CallFlow.Action.None, f.onCallState("OFFHOOK"))
    assertEquals(CallFlow.Action.None, f.onHeard(listOf("haan"))) // must not answer a finished call

    val a = CallFlow() // call answered manually while still announcing
    assertEquals(CallFlow.Action.Finish("call_ended"), a.onCallState("OFFHOOK"))
    assertEquals(CallFlow.Action.None, a.onAnnounced(true))
  }

  @Test fun ttsFailureDoesNotListen() {
    val f = CallFlow()
    assertTrue(f.onAnnounced(false) is CallFlow.Action.Finish)
  }

  @Test fun agcAmplifiesQuietSpeechWithinLimits() {
    assertEquals(Agc.MAX_GAIN, Agc.gain(5f), 0.001f)           // near-silence: capped, never explodes
    assertEquals(1f, Agc.gain(30_000f), 0.001f)                // loud: never attenuates below 1x
    assertTrue(Agc.gain(300f) > 30f && Agc.gain(300f) < 40f)   // quiet speech (peak 300) -> about 33x
    val buf = shortArrayOf(300, -300, 20_000, -20_000)
    Agc.apply(buf, 4, 60f)
    assertEquals(18000, buf[0].toInt()); assertEquals(Short.MAX_VALUE.toInt(), buf[2].toInt()); assertEquals(Short.MIN_VALUE.toInt(), buf[3].toInt()) // clips, no overflow
    assertEquals(300, Agc.peak(shortArrayOf(10, -300, 200), 3))
    assertEquals(300f, Agc.envelope(0f, 300), 0.001f)
    assertEquals(270f, Agc.envelope(300f, 0), 0.001f)           // slow release
  }
}
