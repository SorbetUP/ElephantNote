import java.io.File
import org.apache.tools.ant.taskdefs.condition.Os
import org.gradle.api.DefaultTask
import org.gradle.api.GradleException
import org.gradle.api.logging.LogLevel
import org.gradle.api.tasks.Input
import org.gradle.api.tasks.TaskAction

open class BuildTask : DefaultTask() {
    @Input
    var rootDirRel: String? = null
    @Input
    var target: String? = null
    @Input
    var release: Boolean? = null

    @TaskAction
    fun assemble() {
        // https://github.com/tauri-apps/tauri/issues/9536
        val executable = if (Os.isFamily(Os.FAMILY_WINDOWS)) {
            // Try to find bun.exe in PATH first, then fall back to bun.cmd
            val bunExe = System.getenv("PATH")?.split(File.pathSeparator)
                ?.map { File(it, "bun.exe") }
                ?.find { it.exists() }
            
            when {
                bunExe != null -> bunExe.absolutePath
                File("bun.cmd").exists() -> "bun.cmd"
                else -> "bun.exe"
            }
        } else {
            "bun"
        }
        
        runTauriCli(executable)
    }

    fun runTauriCli(executable: String) {
        val rootDirRel = rootDirRel ?: throw GradleException("rootDirRel cannot be null")
        val target = target ?: throw GradleException("target cannot be null")
        val release = release ?: throw GradleException("release cannot be null")
        val args = listOf("tauri", "android", "android-studio-script");

        project.exec {
            workingDir(File(project.projectDir, rootDirRel))
            executable(executable)
            args(args)
            if (project.logger.isEnabled(LogLevel.DEBUG)) {
                args("-vv")
            } else if (project.logger.isEnabled(LogLevel.INFO)) {
                args("-v")
            }
            if (release) {
                args("--release")
            }
            args(listOf("--target", target))
        }.assertNormalExitValue()
    }
}